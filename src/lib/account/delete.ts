import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import { loadEmailEnv } from "@/lib/email/env";
import { sendEmail } from "@/lib/email/send";
import { accountDeletedEmail } from "@/lib/email/templates";

/**
 * Delete an account and the personal data around it (GDPR). Receipts keep
 * the payer's address (accounting law). Rentals that are still running stay
 * on the wall until they end, without an owner, e-mail or public name.
 */
export async function deleteAccount(sql: Sql, userId: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "last_admin" }> {
  const outcome = await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string; email: string; role: string; locale: "en" | "sk" }[]>`
      select id, email, role, locale from users where id = ${userId} for update
    `;
    if (!user) return "not_found" as const;
    if (user.role === "admin") {
      const [{ others }] = await tx<{ others: number }[]>`select count(*)::int as others from users where role = 'admin' and id <> ${userId}`;
      if (others === 0) return "last_admin" as const;
    }
    const rentals = await tx<{ id: string }[]>`
      update rentals
      set user_id = null, email = null, marketing_consent = false, order_token_hash = null, client_hash = null, reminders_enabled = false
      where user_id = ${userId} or lower(email) = ${user.email}
      returning id
    `;
    if (rentals.length) {
      await tx`update content_versions set display_name = null where rental_id in ${tx(rentals.map((r) => r.id))}`;
    }
    await tx`update reports set reporter_email = null where lower(reporter_email) = ${user.email}`;
    await tx`
      update rental_transfers set cancelled_at = now()
      where (to_email = ${user.email} or from_user_id = ${userId}) and accepted_at is null and cancelled_at is null
    `;
    // E-mails sent to the address go too, except receipts.
    await tx`delete from email_log where lower(to_email) = ${user.email} and template <> 'paid'`;
    await tx`delete from login_tokens where email = ${user.email}`;
    await tx`delete from users where id = ${userId}`;
    await tx`
      insert into audit_log (action, target, details)
      values ('account.deleted', ${`user:${userId}`},
              ${tx.json({ rentals: rentals.length, emailHash: createHash("sha256").update(user.email).digest("hex").slice(0, 16) })})
    `;
    return { email: user.email, locale: user.locale };
  });
  if (outcome === "not_found" || outcome === "last_admin") return { ok: false, reason: outcome };
  try {
    const env = await loadEmailEnv(sql);
    await sendEmail(sql, { to: outcome.email, template: "account_deleted", locale: outcome.locale, ...accountDeletedEmail(env, { locale: outcome.locale }) });
  } catch (error) {
    console.error("[email] account_deleted failed:", error);
  }
  return { ok: true };
}
