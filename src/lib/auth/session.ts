import type { Sql } from "@/lib/db";
import { hashToken, newToken } from "@/lib/orders/tokens";
import type { UserRow } from "./accounts";

/**
 * Signed-in browsers: the httpOnly cookie holds a random token, the database
 * only its SHA-256 hash. Signing out deletes the row, so a stolen cookie stops
 * working at once.
 */

export const SESSION_COOKIE = "pw_session";
export const SESSION_DAYS = 30;
/** Staff confirm the second factor again after this many hours. */
export const STAFF_MFA_HOURS = 12;

export interface SessionInfo {
  idHash: string;
  user: UserRow;
  mfaAt: Date | null;
  createdAt: Date;
}

export function parseSessionToken(value: string | undefined | null): string | null {
  return value && /^[A-Za-z0-9_-]{40,60}$/.test(value) ? value : null;
}

export async function createSession(sql: Sql, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const [row] = await sql<{ expires_at: Date }[]>`
    insert into sessions (id_hash, user_id, expires_at)
    values (${hashToken(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))
    returning expires_at
  `;
  return { token, expiresAt: row.expires_at };
}

export async function findSession(sql: Sql, token: string | null): Promise<SessionInfo | null> {
  if (!token) return null;
  const idHash = hashToken(token);
  const [row] = await sql<(UserRow & { session_mfa_at: Date | null; session_created_at: Date; session_seen_at: Date })[]>`
    select u.*, s.mfa_at as session_mfa_at, s.created_at as session_created_at, s.last_seen_at as session_seen_at
    from sessions s join users u on u.id = s.user_id
    where s.id_hash = ${idHash} and s.expires_at > now()
  `;
  if (!row) return null;
  const { session_mfa_at, session_created_at, session_seen_at, ...user } = row;
  // Remember activity at most once an hour (keeps reads cheap).
  if (Date.now() - session_seen_at.getTime() > 3600_000) {
    await sql`update sessions set last_seen_at = now() where id_hash = ${idHash}`;
  }
  return {
    idHash,
    user: { ...user, totp_last_step: user.totp_last_step === null ? null : Number(user.totp_last_step) },
    mfaAt: session_mfa_at,
    createdAt: session_created_at,
  };
}

export async function deleteSession(sql: Sql, token: string | null): Promise<void> {
  if (!token) return;
  await sql`delete from sessions where id_hash = ${hashToken(token)}`;
}

/** Sign out everywhere (account deleted, role removed, …). */
export async function deleteUserSessions(sql: Sql, userId: string): Promise<void> {
  await sql`delete from sessions where user_id = ${userId}`;
}

export async function markSessionMfa(sql: Sql, idHash: string): Promise<void> {
  await sql`update sessions set mfa_at = now() where id_hash = ${idHash}`;
}

/** Staff passed the second factor in this session recently enough. */
export function hasFreshMfa(session: SessionInfo, now = Date.now()): boolean {
  return session.mfaAt !== null && now - session.mfaAt.getTime() < STAFF_MFA_HOURS * 3600_000;
}

export async function pruneSessions(sql: Sql): Promise<void> {
  await sql`delete from sessions where expires_at < now()`;
  await sql`delete from login_tokens where expires_at < now() - interval '1 day'`;
}
