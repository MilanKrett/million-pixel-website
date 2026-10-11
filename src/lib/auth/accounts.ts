import type { Queryable, Sql } from "@/lib/db";

/**
 * Accounts. Nobody registers: an account is created the first time someone
 * signs in with a link sent to their e-mail address, and it owns every rental
 * ordered with that address.
 */

export type Role = "user" | "moderator" | "admin";

export interface UserRow {
  id: string;
  email: string;
  role: Role;
  locale: "en" | "sk";
  created_at: Date;
  last_login_at: Date | null;
  totp_secret: string | null;
  totp_enabled_at: Date | null;
  totp_last_step: number | null;
  recovery_codes: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-case, trimmed e-mail address, or null when it is not one. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** Addresses that always get the admin role (first admin of a new site), from ADMIN_EMAILS. */
export function bootstrapAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => normalizeEmail(e))
    .filter((e): e is string => e !== null);
}

export const isStaff = (role: Role) => role === "admin" || role === "moderator";

export async function findOrCreateUser(sql: Queryable, email: string, locale: "en" | "sk"): Promise<UserRow> {
  const role: Role | null = bootstrapAdminEmails().includes(email) ? "admin" : null;
  const [user] = await sql<UserRow[]>`
    insert into users (email, locale, role)
    values (${email}, ${locale}, ${role ?? "user"})
    on conflict (email) do update set role = coalesce(${role}, users.role)
    returning *
  `;
  return { ...user, totp_last_step: user.totp_last_step === null ? null : Number(user.totp_last_step) };
}

/** Give the account every rental ordered with its e-mail address that has no owner yet. */
export async function linkRentals(sql: Sql, user: Pick<UserRow, "id" | "email">): Promise<number> {
  const rows = await sql`
    update rentals set user_id = ${user.id}
    where user_id is null and lower(email) = ${user.email}
      and status not in ('hold', 'awaiting_payment', 'expired')
    returning id
  `;
  return rows.length;
}
