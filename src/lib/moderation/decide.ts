import type { Queryable, Sql } from "@/lib/db";
import type { ReasonCode } from "@/lib/email/templates";
import { refundRental, type Actor } from "@/lib/payments/refund";
import type { Settings } from "@/lib/settings/schema";

/**
 * Moderation decisions. Every one is a single transaction plus an audit log
 * entry; e-mails and the wall redraw are done by the caller after commit.
 *
 * A content version is either the first content of a paid rental (the rental
 * is "in_review" and starts when approved) or a change to a running rental
 * (the old content stays until the change is approved).
 */

export type { Actor };

export type ApproveResult =
  | { ok: true; rentalId: string; kind: "new" | "change"; endsAt: Date | null }
  | { ok: false; reason: "not_found" | "not_pending" | "rental_state" };

export async function approveContent(sql: Sql, contentId: string, actor: Actor): Promise<ApproveResult> {
  return sql.begin(async (tx): Promise<ApproveResult> => {
    const [content] = await tx<{ id: string; rental_id: string; status: string }[]>`
      select id, rental_id, status from content_versions where id = ${contentId} for update
    `;
    if (!content) return { ok: false, reason: "not_found" };
    if (content.status !== "pending") return { ok: false, reason: "not_pending" };
    const [rental] = await tx<{ status: string; period_years: number | null }[]>`
      select status, period_years from rentals where id = ${content.rental_id} for update
    `;
    if (!rental) return { ok: false, reason: "not_found" };

    let kind: "new" | "change";
    let endsAt: Date | null = null;
    if (rental.status === "in_review") {
      kind = "new";
    } else if (rental.status === "active" || rental.status === "grace") {
      kind = "change";
    } else {
      return { ok: false, reason: "rental_state" };
    }

    await tx`
      update content_versions set status = 'superseded'
      where rental_id = ${content.rental_id} and status = 'approved' and id <> ${content.id}
    `;
    await tx`
      update content_versions set status = 'approved', decided_at = now(), moderator_id = ${actor.id}
      where id = ${content.id}
    `;
    if (kind === "new") {
      // The rental period runs from approval, not from payment.
      const [row] = await tx<{ ends_at: Date }[]>`
        update rentals
        set status = 'active', active_content_id = ${content.id}, starts_at = now(),
            ends_at = now() + make_interval(years => ${rental.period_years ?? 1}), reupload_until = null
        where id = ${content.rental_id}
        returning ends_at
      `;
      endsAt = row.ends_at;
    } else {
      await tx`update rentals set active_content_id = ${content.id} where id = ${content.rental_id}`;
    }
    await audit(tx, actor, "content.approved", content.rental_id, { content: content.id, kind });
    return { ok: true, rentalId: content.rental_id, kind, endsAt };
  });
}

/** Approve the newest content waiting for a rental (the phase 2 approve button). */
export async function approveRental(
  sql: Sql,
  rentalId: string,
  actor: Actor,
): Promise<{ ok: true; endsAt: Date | null } | { ok: false; reason: "not_found" | "not_in_review" | "no_content" }> {
  const [content] = await sql<{ id: string; status: string }[]>`
    select c.id, r.status from rentals r
    join content_versions c on c.rental_id = r.id and c.status = 'pending'
    where r.id = ${rentalId}
    order by c.created_at desc limit 1
  `;
  if (!content) {
    const [exists] = await sql`select 1 from rentals where id = ${rentalId}`;
    return { ok: false, reason: exists ? "not_in_review" : "not_found" };
  }
  if (content.status !== "in_review") return { ok: false, reason: "not_in_review" };
  const result = await approveContent(sql, content.id, actor);
  return result.ok ? { ok: true, endsAt: result.endsAt } : { ok: false, reason: "not_in_review" };
}

export interface Decision {
  reasonCode: ReasonCode;
  note?: string | null;
}

export type RejectResult =
  | { ok: true; rentalId: string; kind: "new" | "change"; until: Date | null; refunded: boolean; refundedCents: number; blocked: boolean }
  | { ok: false; reason: "not_found" | "not_pending" | "rental_state" };

/**
 * Reject content (mode "reject") or ask for changes (mode "changes").
 *  - New rental: the renter may send other content until the re-upload
 *    deadline; afterwards the payment is refunded automatically. With
 *    `refundNow` the order ends at once with a full refund.
 *  - Change to a running rental: the old content simply stays.
 *  - Reason "child": the content is blocked for good and the space freed,
 *    without telling the uploader (they must not be warned).
 */
export async function rejectContent(
  sql: Sql,
  settings: Pick<Settings, "reupload_days">,
  contentId: string,
  actor: Actor,
  decision: Decision & { mode: "reject" | "changes"; refundNow?: boolean },
): Promise<RejectResult> {
  const note = decision.note?.trim().slice(0, 2000) || null;
  const blocked = decision.reasonCode === "child";
  const result = await sql.begin(async (tx): Promise<RejectResult> => {
    const [content] = await tx<{ id: string; rental_id: string; status: string }[]>`
      select id, rental_id, status from content_versions where id = ${contentId} for update
    `;
    if (!content) return { ok: false, reason: "not_found" };
    if (content.status !== "pending") return { ok: false, reason: "not_pending" };
    const [rental] = await tx<{ status: string }[]>`select status from rentals where id = ${content.rental_id} for update`;
    if (!rental) return { ok: false, reason: "not_found" };
    const kind = rental.status === "in_review" ? "new" : rental.status === "active" || rental.status === "grace" ? "change" : null;
    if (!kind) return { ok: false, reason: "rental_state" };

    await tx`
      update content_versions
      set status = ${decision.mode === "changes" ? "changes_requested" : "rejected"},
          reason_code = ${decision.reasonCode}, reason = ${note}, moderator_id = ${actor.id}, decided_at = now(),
          blocked_at = ${blocked ? new Date() : null}
      where id = ${content.id}
    `;
    let until: Date | null = null;
    if (blocked) {
      await tx`update rentals set status = 'removed', hidden_at = coalesce(hidden_at, now()) where id = ${content.rental_id}`;
    } else if (kind === "new" && !decision.refundNow) {
      const [row] = await tx<{ reupload_until: Date }[]>`
        update rentals set status = 'rejected', reupload_until = now() + make_interval(days => ${settings.reupload_days})
        where id = ${content.rental_id}
        returning reupload_until
      `;
      until = row.reupload_until;
    }
    await audit(tx, actor, decision.mode === "changes" ? "content.changes_requested" : "content.rejected", content.rental_id, {
      content: content.id,
      kind,
      reason: decision.reasonCode,
      note,
      refundNow: Boolean(decision.refundNow),
    });
    return { ok: true, rentalId: content.rental_id, kind, until, refunded: false, refundedCents: 0, blocked };
  });
  if (result.ok && result.kind === "new" && decision.refundNow && !blocked) {
    const refund = await refundRental(sql, result.rentalId, { endRental: true, actor, cause: "rejected" });
    return { ...result, refunded: refund.ok, refundedCents: refund.ok ? refund.refundedCents : 0 };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Actions on a rental
// ---------------------------------------------------------------------------

/** Emergency hide: the content leaves the wall (within the next redraw), the space stays taken. */
export async function hideRental(sql: Sql, rentalId: string, actor: Actor, decision: Decision): Promise<boolean> {
  return sql.begin(async (tx) => {
    const rows = await tx`
      update rentals set hidden_at = now(), hidden_reason = ${decision.reasonCode}
      where id = ${rentalId} and hidden_at is null and status in ('active', 'grace', 'in_review', 'rejected')
      returning id
    `;
    if (!rows.length) return false;
    await audit(tx, actor, "rental.hidden", rentalId, { reason: decision.reasonCode, note: decision.note ?? null });
    return true;
  });
}

export async function unhideRental(sql: Sql, rentalId: string, actor: Actor): Promise<boolean> {
  return sql.begin(async (tx) => {
    const rows = await tx`
      update rentals set hidden_at = null, hidden_reason = null
      where id = ${rentalId} and hidden_at is not null and status in ('active', 'grace', 'in_review', 'rejected')
      returning id
    `;
    if (!rows.length) return false;
    await audit(tx, actor, "rental.unhidden", rentalId, {});
    return true;
  });
}

/**
 * Remove for breaking the rules: the rental ends without a refund (terms of
 * service) and the space is freed. Reason "child" also blocks every version
 * of its content for good.
 */
export async function removeRental(sql: Sql, rentalId: string, actor: Actor, decision: Decision): Promise<boolean> {
  return sql.begin(async (tx) => {
    const rows = await tx`
      update rentals set status = 'removed', hidden_at = coalesce(hidden_at, now()), hidden_reason = ${decision.reasonCode}
      where id = ${rentalId} and status in ('active', 'grace')
      returning id
    `;
    if (!rows.length) return false;
    if (decision.reasonCode === "child") {
      await tx`update content_versions set blocked_at = now() where rental_id = ${rentalId} and blocked_at is null`;
    }
    await audit(tx, actor, "rental.removed", rentalId, { reason: decision.reasonCode, note: decision.note?.trim() || null });
    return true;
  });
}

/** Extend for free (compensation, contests, own ads). */
export async function extendRental(sql: Sql, rentalId: string, actor: Actor, days: number): Promise<Date | null> {
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return sql.begin(async (tx) => {
    const [row] = await tx<{ ends_at: Date }[]>`
      update rentals
      set ends_at = greatest(ends_at, now()) + make_interval(days => ${days}),
          status = case when status = 'grace' then 'active' else status end
      where id = ${rentalId} and status in ('active', 'grace') and ends_at is not null
      returning ends_at
    `;
    if (!row) return null;
    await audit(tx, actor, "rental.extended_free", rentalId, { days, endsAt: row.ends_at });
    return row.ends_at;
  });
}

async function audit(tx: Queryable, actor: Actor, action: string, rentalId: string, details: Record<string, unknown>) {
  await tx`
    insert into audit_log (actor_id, action, target, details)
    values (${actor.id}, ${action}, ${`rental:${rentalId}`}, ${tx.json({ ...details, by: actor.label } as never)})
  `;
}
