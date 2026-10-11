import type { Locale } from "@/i18n/config";
import { normalizeEmail } from "@/lib/auth/accounts";
import type { Sql } from "@/lib/db";
import { loadEmailEnv } from "@/lib/email/env";
import { sendEmail } from "@/lib/email/send";
import { REASON_CODES, reportDecidedEmail, reportReceivedEmail, type ReasonCode } from "@/lib/email/templates";
import { notifyHidden, notifyRemoved } from "@/lib/orders/notify";
import { hit } from "@/lib/rate-limit";
import { hideRental, removeRental, unhideRental, type Actor } from "./decide";

/**
 * Reports from visitors (EU Digital Services Act: notice and action). Every
 * report gets a reference number; a reporter who leaves an address is told
 * that it arrived and, later, what was decided.
 */

export const REPORT_LIMITS = { perHour: 5, perDay: 20 };

export function reportReference(id: string): string {
  return `R-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export type CreateReportResult =
  | { ok: true; id: string; reference: string }
  | { ok: false; reason: "invalid" | "rental_not_found" | "description_required" | "email_invalid" | "rate_limited" };

export async function createReport(
  sql: Sql,
  input: { rentalNo: unknown; category: unknown; description: unknown; email: unknown; locale: Locale; clientKey: string },
): Promise<CreateReportResult> {
  const category = REASON_CODES.includes(input.category as ReasonCode) ? (input.category as ReasonCode) : null;
  const no = Number(input.rentalNo);
  if (!category || !Number.isSafeInteger(no) || no <= 0) return { ok: false, reason: "invalid" };
  const description = typeof input.description === "string" ? input.description.trim().slice(0, 5000) : "";
  if (category === "other" && !description) return { ok: false, reason: "description_required" };
  const rawEmail = typeof input.email === "string" ? input.email.trim() : "";
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && !email) return { ok: false, reason: "email_invalid" };

  const [hourOk, dayOk] = await Promise.all([
    hit(sql, "report-hour", input.clientKey, REPORT_LIMITS.perHour, 3600),
    hit(sql, "report-day", input.clientKey, REPORT_LIMITS.perDay, 86400),
  ]);
  if (!hourOk || !dayOk) return { ok: false, reason: "rate_limited" };

  const [rental] = await sql<{ id: string; active_content_id: string | null }[]>`
    select id, active_content_id from rentals where no = ${no} and status in ('active', 'grace', 'in_review', 'rejected')
  `;
  if (!rental) return { ok: false, reason: "rental_not_found" };

  const [report] = await sql<{ id: string }[]>`
    insert into reports (rental_id, rental_no, content_id, category, description, reporter_email, locale, client_hash)
    values (${rental.id}, ${no}, ${rental.active_content_id}, ${category}, ${description || null}, ${email}, ${input.locale}, ${input.clientKey})
    returning id
  `;
  const reference = reportReference(report.id);
  if (email) {
    try {
      const env = await loadEmailEnv(sql);
      await sendEmail(sql, { to: email, template: "report_received", locale: input.locale, rentalId: rental.id, ...reportReceivedEmail(env, { locale: input.locale, reference, no }) });
    } catch (error) {
      console.error("[email] report_received failed:", error);
    }
  }
  return { ok: true, id: report.id, reference };
}

export type ReportDecision = "dismiss" | "hide" | "remove";

/**
 * The moderator's answer to a report.
 *  - dismiss: no breach; the report closes. With `unhide`, a rental hidden
 *    while it was checked comes back (if nothing else is open about it).
 *  - hide: emergency hide while it is being looked into; the report stays open.
 *  - remove: breach; the rental ends without refund and every open report
 *    about it is closed as actioned.
 */
export async function decideReport(
  sql: Sql,
  reportId: string,
  actor: Actor,
  input: { decision: ReportDecision; reasonCode: ReasonCode; note?: string | null; unhide?: boolean },
): Promise<{ ok: true; rentalId: string | null; wallChanged: boolean } | { ok: false; reason: "not_found" | "closed" | "rental_state" }> {
  const [report] = await sql<{ id: string; rental_id: string | null; status: string }[]>`
    select id, rental_id, status from reports where id = ${reportId}
  `;
  if (!report) return { ok: false, reason: "not_found" };
  if (report.status !== "open") return { ok: false, reason: "closed" };
  const note = input.note?.trim().slice(0, 2000) || null;
  const decision = { reasonCode: input.reasonCode, note };
  const rentalId = report.rental_id;

  if (input.decision === "hide") {
    if (!rentalId || !(await hideRental(sql, rentalId, actor, decision))) return { ok: false, reason: "rental_state" };
    if (input.reasonCode !== "child") await notifyHidden(sql, rentalId, decision);
    return { ok: true, rentalId, wallChanged: true };
  }

  if (input.decision === "remove") {
    if (!rentalId || !(await removeRental(sql, rentalId, actor, decision))) return { ok: false, reason: "rental_state" };
    const closed = await sql<{ id: string; reporter_email: string | null; locale: Locale; rental_no: number | null }[]>`
      update reports set status = 'actioned', action = 'removed', resolution = ${note}, resolved_at = now(), decided_by = ${actor.id}
      where rental_id = ${rentalId} and status = 'open'
      returning id, reporter_email, locale, rental_no
    `;
    // Someone sharing child-abuse material must not be warned.
    if (input.reasonCode !== "child") await notifyRemoved(sql, rentalId, decision);
    await tellReporters(sql, closed, "actioned");
    return { ok: true, rentalId, wallChanged: true };
  }

  const [closed] = await sql<{ id: string; reporter_email: string | null; locale: Locale; rental_no: number | null }[]>`
    update reports set status = 'dismissed', action = 'none', resolution = ${note}, resolved_at = now(), decided_by = ${actor.id}
    where id = ${reportId} and status = 'open'
    returning id, reporter_email, locale, rental_no
  `;
  await sql`
    insert into audit_log (actor_id, action, target, details)
    values (${actor.id}, 'report.dismissed', ${`report:${reportId}`}, ${sql.json({ rental: rentalId, note, by: actor.label })})
  `;
  let wallChanged = false;
  if (rentalId && input.unhide) {
    const [{ open }] = await sql<{ open: number }[]>`select count(*)::int as open from reports where rental_id = ${rentalId} and status = 'open'`;
    if (open === 0) wallChanged = await unhideRental(sql, rentalId, actor);
  }
  if (closed) await tellReporters(sql, [closed], "dismissed");
  return { ok: true, rentalId, wallChanged };
}

async function tellReporters(
  sql: Sql,
  reports: { id: string; reporter_email: string | null; locale: Locale; rental_no: number | null }[],
  outcome: "actioned" | "dismissed",
) {
  const withEmail = reports.filter((r) => r.reporter_email);
  if (!withEmail.length) return;
  try {
    const env = await loadEmailEnv(sql);
    for (const r of withEmail) {
      await sendEmail(sql, {
        to: r.reporter_email!,
        template: "report_decided",
        locale: r.locale,
        ...reportDecidedEmail(env, { locale: r.locale, reference: reportReference(r.id), no: r.rental_no, outcome }),
      });
    }
  } catch (error) {
    console.error("[email] report_decided failed:", error);
  }
}
