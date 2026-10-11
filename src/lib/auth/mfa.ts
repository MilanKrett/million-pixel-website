import type { Sql } from "@/lib/db";
import { hit } from "@/lib/rate-limit";
import type { UserRow } from "./accounts";
import { markSessionMfa, type SessionInfo } from "./session";
import { decryptSecret, encryptSecret, generateRecoveryCodes, generateSecret, hashRecoveryCode, verifyTotp } from "./totp";

/** Two-factor login for staff: set up once with an authenticator app, confirmed in every new session. */

/** The secret being set up (created once, so reloading the page keeps the same QR code). */
export async function ensurePendingTotp(sql: Sql, user: UserRow): Promise<string> {
  if (user.totp_enabled_at) throw new Error("Two-factor login is already set up");
  const [row] = await sql<{ totp_secret: string }[]>`
    update users set totp_secret = coalesce(totp_secret, ${encryptSecret(generateSecret())})
    where id = ${user.id} and totp_enabled_at is null
    returning totp_secret
  `;
  if (!row) throw new Error("Two-factor login is already set up");
  return decryptSecret(row.totp_secret);
}

export type MfaFailure = { ok: false; reason: "invalid" | "rate_limited" | "not_set_up" };
export type MfaResult = { ok: true } | MfaFailure;

async function allowed(sql: Sql, userId: string): Promise<boolean> {
  return hit(sql, "mfa", userId, 10, 15 * 60);
}

/** Finish the setup with the first code from the app. Returns the recovery codes (shown once). */
export async function enableTotp(sql: Sql, session: SessionInfo, code: unknown): Promise<{ ok: true; recoveryCodes: string[] } | MfaFailure> {
  const user = session.user;
  if (user.totp_enabled_at || !user.totp_secret) return { ok: false, reason: "not_set_up" };
  if (!(await allowed(sql, user.id))) return { ok: false, reason: "rate_limited" };
  const step = typeof code === "string" ? verifyTotp(decryptSecret(user.totp_secret), code, null) : null;
  if (step === null) return { ok: false, reason: "invalid" };
  const recoveryCodes = generateRecoveryCodes();
  await sql`
    update users
    set totp_enabled_at = now(), totp_last_step = ${step}, recovery_codes = ${recoveryCodes.map(hashRecoveryCode)}
    where id = ${user.id} and totp_enabled_at is null
  `;
  await markSessionMfa(sql, session.idHash);
  await sql`insert into audit_log (actor_id, action, target) values (${user.id}, 'mfa.enabled', ${`user:${user.id}`})`;
  return { ok: true, recoveryCodes };
}

/** Confirm the second factor in this session: a code from the app or one recovery code. */
export async function verifySecondFactor(sql: Sql, session: SessionInfo, code: unknown): Promise<MfaResult> {
  const user = session.user;
  if (!user.totp_enabled_at || !user.totp_secret) return { ok: false, reason: "not_set_up" };
  if (typeof code !== "string" || code.length > 40) return { ok: false, reason: "invalid" };
  if (!(await allowed(sql, user.id))) return { ok: false, reason: "rate_limited" };

  const step = verifyTotp(decryptSecret(user.totp_secret), code, user.totp_last_step);
  if (step !== null) {
    // Guarded update: two requests with the same code cannot both pass.
    const rows = await sql`
      update users set totp_last_step = ${step}
      where id = ${user.id} and (totp_last_step is null or totp_last_step < ${step})
      returning id
    `;
    if (!rows.length) return { ok: false, reason: "invalid" };
  } else {
    const hash = hashRecoveryCode(code);
    const rows = await sql`
      update users set recovery_codes = array_remove(recovery_codes, ${hash})
      where id = ${user.id} and ${hash} = any(recovery_codes)
      returning id
    `;
    if (!rows.length) return { ok: false, reason: "invalid" };
    await sql`insert into audit_log (actor_id, action, target) values (${user.id}, 'mfa.recovery_code_used', ${`user:${user.id}`})`;
  }
  await markSessionMfa(sql, session.idHash);
  return { ok: true };
}

/** An admin resets someone's two-factor login (lost phone); they set it up again at next sign-in. */
export async function resetTotp(sql: Sql, userId: string): Promise<void> {
  await sql`
    update users set totp_secret = null, totp_enabled_at = null, totp_last_step = null, recovery_codes = '{}'
    where id = ${userId}
  `;
  await sql`update sessions set mfa_at = null where user_id = ${userId}`;
}
