import { localePath, type Locale } from "@/i18n/config";
import type { Sql } from "@/lib/db";
import { loadEmailEnv } from "@/lib/email/env";
import { sendEmail } from "@/lib/email/send";
import { loginEmail, siteUrl } from "@/lib/email/templates";
import { hashToken, newToken } from "@/lib/orders/tokens";
import { hit } from "@/lib/rate-limit";
import { findOrCreateUser, linkRentals, normalizeEmail, type UserRow } from "./accounts";
import { createSession } from "./session";

/**
 * Sign-in without a password: a one-time link valid for a few minutes
 * (setting magic_link_minutes) is e-mailed to the address. The answer never
 * reveals whether the address has an account.
 */

export const LOGIN_LIMITS = { perEmailHour: 5, perClientHour: 20 };

/** Only paths on this site ("/my-pixels", "/admin"), never "//evil.com" or "https:…". */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return null;
  return value;
}

export type LoginRequestResult = "sent" | "invalid" | "rate_limited";

export async function requestLoginLink(
  sql: Sql,
  input: { email: unknown; locale: Locale; next?: unknown; clientKey: string },
): Promise<LoginRequestResult> {
  const email = normalizeEmail(input.email);
  if (!email) return "invalid";
  const [byEmail, byClient] = await Promise.all([
    hit(sql, "login-email", email, LOGIN_LIMITS.perEmailHour, 3600),
    hit(sql, "login-client", input.clientKey, LOGIN_LIMITS.perClientHour, 3600),
  ]);
  if (!byEmail || !byClient) return "rate_limited";

  const env = await loadEmailEnv(sql);
  const minutes = env.settings.magic_link_minutes;
  const token = newToken();
  await sql`
    insert into login_tokens (token_hash, email, next_path, locale, expires_at)
    values (${hashToken(token)}, ${email}, ${safeNextPath(input.next)}, ${input.locale}, now() + make_interval(mins => ${minutes}))
  `;
  // The token travels in the #fragment: it never reaches server logs or other sites.
  const url = `${siteUrl()}${localePath(input.locale, "/login/confirm")}#${token}`;
  await sendEmail(sql, { to: email, template: "login", locale: input.locale, ...loginEmail(env, { locale: input.locale, url, minutes }) });
  return "sent";
}

export interface LoginResult {
  user: UserRow;
  sessionToken: string;
  sessionExpires: Date;
  next: string | null;
  locale: Locale;
}

/** Use a sign-in link: valid once, before it expires. */
export async function consumeLoginToken(sql: Sql, token: unknown): Promise<LoginResult | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const [row] = await sql<{ email: string; next_path: string | null; locale: Locale }[]>`
    update login_tokens set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning email, next_path, locale
  `;
  if (!row) return null;
  const user = await findOrCreateUser(sql, row.email, row.locale);
  await sql`update users set last_login_at = now() where id = ${user.id}`;
  await linkRentals(sql, user);
  const session = await createSession(sql, user.id);
  return { user, sessionToken: session.token, sessionExpires: session.expiresAt, next: row.next_path, locale: row.locale };
}
