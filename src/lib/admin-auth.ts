import { timingSafeEqual } from "node:crypto";

/**
 * Temporary protection of /admin until real accounts with two-factor login
 * arrive in phase 3: HTTP Basic auth with ADMIN_USER / ADMIN_PASSWORD from the
 * environment. Without both variables the admin does not exist (404).
 */

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 12);
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isAdminAuthorization(header: string | null): boolean {
  if (!adminConfigured() || !header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  const user = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  // Evaluate both comparisons so timing does not reveal which part was wrong.
  const userOk = same(user, process.env.ADMIN_USER!);
  const passwordOk = same(password, process.env.ADMIN_PASSWORD!);
  return userOk && passwordOk;
}

export function isAdminRequest(request: Request): boolean {
  return isAdminAuthorization(request.headers.get("authorization"));
}
