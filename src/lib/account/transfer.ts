import { localePath, type Locale } from "@/i18n/config";
import { findOrCreateUser, normalizeEmail, type UserRow } from "@/lib/auth/accounts";
import { createSession } from "@/lib/auth/session";
import type { Sql } from "@/lib/db";
import { loadEmailEnv } from "@/lib/email/env";
import { sendEmail } from "@/lib/email/send";
import { siteUrl, transferDoneEmail, transferOfferEmail, type RentalEmailData } from "@/lib/email/templates";
import { hashToken, newToken } from "@/lib/orders/tokens";
import { hit } from "@/lib/rate-limit";

/**
 * Giving a rental to someone else (a gift). The recipient gets a link and
 * has to accept it, so a typo in the address never gives the rental away;
 * until then the owner can cancel. Accepting signs the recipient in (the
 * link proves they own the address).
 */

const TRANSFERABLE = ["in_review", "active", "grace"];

export type StartTransferResult = { ok: true } | { ok: false; reason: "email_invalid" | "same_owner" | "not_found" | "not_transferable" | "rate_limited" };

async function emailData(sql: Sql, rentalId: string, locale: Locale, to: string): Promise<RentalEmailData | null> {
  const [r] = await sql<{ no: number; x: number; y: number; w: number; h: number; period_years: number | null; ends_at: Date | null; title: string | null }[]>`
    select r.no, r.x, r.y, r.w, r.h, r.period_years, r.ends_at,
           coalesce((select title from content_versions where id = r.active_content_id),
                    (select title from content_versions where rental_id = r.id and title is not null order by created_at desc limit 1)) as title
    from rentals r where r.id = ${rentalId}
  `;
  if (!r) return null;
  return { locale, to, no: r.no, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, years: r.period_years ?? 1, title: r.title ?? "", amountCents: 0, endsAt: r.ends_at };
}

export async function startTransfer(
  sql: Sql,
  input: { rentalId: string; owner: UserRow; toEmail: unknown; locale: Locale },
): Promise<StartTransferResult> {
  const to = normalizeEmail(input.toEmail);
  if (!to) return { ok: false, reason: "email_invalid" };
  if (to === input.owner.email) return { ok: false, reason: "same_owner" };
  if (!(await hit(sql, "transfer", input.owner.id, 10, 86400))) return { ok: false, reason: "rate_limited" };

  const env = await loadEmailEnv(sql);
  const token = newToken();
  const created = await sql.begin(async (tx) => {
    const [rental] = await tx<{ status: string; user_id: string | null }[]>`
      select status, user_id from rentals where id = ${input.rentalId} for update
    `;
    if (!rental || rental.user_id !== input.owner.id) return "not_found" as const;
    if (!TRANSFERABLE.includes(rental.status)) return "not_transferable" as const;
    await tx`
      update rental_transfers set cancelled_at = now()
      where rental_id = ${input.rentalId} and accepted_at is null and cancelled_at is null
    `;
    await tx`
      insert into rental_transfers (rental_id, from_user_id, to_email, token_hash, locale, expires_at)
      values (${input.rentalId}, ${input.owner.id}, ${to}, ${hashToken(token)}, ${input.locale},
              now() + make_interval(days => ${env.settings.transfer_days}))
    `;
    await tx`
      insert into audit_log (actor_id, action, target, details)
      values (${input.owner.id}, 'rental.transfer_offered', ${`rental:${input.rentalId}`}, ${tx.json({ to })})
    `;
    return "ok" as const;
  });
  if (created !== "ok") return { ok: false, reason: created };

  const data = await emailData(sql, input.rentalId, input.locale, to);
  if (data) {
    const acceptUrl = `${siteUrl()}${localePath(input.locale, "/transfer")}#${token}`;
    await sendEmail(sql, {
      to,
      template: "transfer_offer",
      locale: input.locale,
      rentalId: input.rentalId,
      ...transferOfferEmail(env, { ...data, acceptUrl, days: env.settings.transfer_days }),
    });
  }
  return { ok: true };
}

export async function cancelTransfer(sql: Sql, rentalId: string, ownerId: string): Promise<boolean> {
  const rows = await sql`
    update rental_transfers t set cancelled_at = now()
    from rentals r
    where t.rental_id = ${rentalId} and r.id = t.rental_id and r.user_id = ${ownerId}
      and t.accepted_at is null and t.cancelled_at is null
    returning t.id
  `;
  return rows.length > 0;
}

export type AcceptTransferResult =
  | { ok: true; sessionToken: string; sessionExpires: Date; locale: Locale }
  | { ok: false; reason: "invalid" };

export async function acceptTransfer(sql: Sql, token: unknown): Promise<AcceptTransferResult> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { ok: false, reason: "invalid" };
  const outcome = await sql.begin(async (tx) => {
    const [transfer] = await tx<{ id: string; rental_id: string; from_user_id: string | null; to_email: string; locale: Locale }[]>`
      select id, rental_id, from_user_id, to_email, locale from rental_transfers
      where token_hash = ${hashToken(token)} and accepted_at is null and cancelled_at is null and expires_at > now()
      for update
    `;
    if (!transfer) return null;
    const [rental] = await tx<{ status: string; user_id: string | null }[]>`
      select status, user_id from rentals where id = ${transfer.rental_id} for update
    `;
    // The rental must still belong to the person who offered it.
    if (!rental || rental.user_id !== transfer.from_user_id || !TRANSFERABLE.includes(rental.status)) return null;
    const user = await findOrCreateUser(tx, transfer.to_email, transfer.locale);
    await tx`
      update rentals
      set user_id = ${user.id}, email = ${transfer.to_email}, locale = ${transfer.locale}, marketing_consent = false
      where id = ${transfer.rental_id}
    `;
    await tx`update rental_transfers set accepted_at = now() where id = ${transfer.id}`;
    await tx`
      insert into audit_log (actor_id, action, target, details)
      values (${user.id}, 'rental.transfer_accepted', ${`rental:${transfer.rental_id}`}, ${tx.json({ from: transfer.from_user_id })})
    `;
    const [previous] = transfer.from_user_id
      ? await tx<{ email: string; locale: Locale }[]>`select email, locale from users where id = ${transfer.from_user_id}`
      : [];
    return { transfer, user, previous: previous ?? null };
  });
  if (!outcome) return { ok: false, reason: "invalid" };

  const session = await createSession(sql, outcome.user.id);
  await sql`update users set last_login_at = now() where id = ${outcome.user.id}`;
  if (outcome.previous) {
    try {
      const env = await loadEmailEnv(sql);
      const data = await emailData(sql, outcome.transfer.rental_id, outcome.previous.locale, outcome.previous.email);
      if (data) {
        await sendEmail(sql, {
          to: outcome.previous.email,
          template: "transfer_done",
          locale: outcome.previous.locale,
          rentalId: outcome.transfer.rental_id,
          ...transferDoneEmail(env, { ...data, newOwner: outcome.transfer.to_email }),
        });
      }
    } catch (error) {
      console.error("[email] transfer_done failed:", error);
    }
  }
  return { ok: true, sessionToken: session.token, sessionExpires: session.expiresAt, locale: outcome.transfer.locale };
}
