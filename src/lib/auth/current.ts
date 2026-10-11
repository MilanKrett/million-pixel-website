import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError } from "@/lib/http";
import { isStaff, type Role } from "./accounts";
import { findSession, hasFreshMfa, parseSessionToken, SESSION_COOKIE, type SessionInfo } from "./session";

/**
 * The signed-in user for pages (Server Components, always inside <Suspense>)
 * and for route handlers. Every handler checks again close to the data;
 * nothing relies on what the browser shows or hides.
 */

export async function getSession(): Promise<SessionInfo | null> {
  const token = parseSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return findSession(db(), token);
}

export async function sessionFromRequest(request: NextRequest): Promise<SessionInfo | null> {
  return findSession(db(), parseSessionToken(request.cookies.get(SESSION_COOKIE)?.value));
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

const ROLE_RANK: Record<Role, number> = { user: 0, moderator: 1, admin: 2 };

export type StaffRole = "moderator" | "admin";

/**
 * Admin pages: signed in, staff role, two-factor login set up and confirmed
 * in this session. Otherwise redirects to the right step (or 404 for others).
 */
export async function requireStaffPage(minRole: StaffRole = "moderator", here = "/admin"): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (!isStaff(session.user.role)) notFound();
  if (!session.user.totp_enabled_at) redirect("/admin/2fa/setup");
  if (!hasFreshMfa(session)) redirect(`/admin/2fa?next=${encodeURIComponent(here)}`);
  if (ROLE_RANK[session.user.role] < ROLE_RANK[minRole]) redirect("/admin");
  return session;
}

/** The 2FA pages themselves: signed in as staff, second factor not needed yet. */
export async function requireStaffLogin(here = "/admin"): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (!isStaff(session.user.role)) notFound();
  return session;
}

/** Admin API: same checks as the pages, answering with JSON errors. */
export async function requireStaffApi(
  request: NextRequest,
  minRole: StaffRole = "moderator",
  options: { mutate?: boolean } = { mutate: true },
): Promise<{ session: SessionInfo } | { error: Response }> {
  if (options.mutate !== false && !isSameOrigin(request)) return { error: jsonError(403, "forbidden") };
  const session = await sessionFromRequest(request);
  if (!session || !isStaff(session.user.role)) return { error: jsonError(401, "unauthorized") };
  if (!session.user.totp_enabled_at || !hasFreshMfa(session)) return { error: jsonError(401, "mfa_required") };
  if (ROLE_RANK[session.user.role] < ROLE_RANK[minRole]) return { error: jsonError(403, "forbidden") };
  return { session };
}

/** Signed-in user for "My pixels" routes. */
export async function requireUserApi(
  request: NextRequest,
  options: { mutate?: boolean } = { mutate: true },
): Promise<{ session: SessionInfo } | { error: Response }> {
  if (options.mutate !== false && !isSameOrigin(request)) return { error: jsonError(403, "forbidden") };
  const session = await sessionFromRequest(request);
  if (!session) return { error: jsonError(401, "unauthorized") };
  return { session };
}
