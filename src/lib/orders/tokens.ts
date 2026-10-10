import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Orders need no account: the browser that started an order holds a random
 * token in an httpOnly cookie ("<rental id>.<token>"); the database only keeps
 * its SHA-256 hash.
 */

export const ORDER_COOKIE = "pw_order";
export const ORDER_COOKIE_MAX_AGE = 7 * 24 * 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function orderCookieValue(rentalId: string, token: string): string {
  return `${rentalId}.${token}`;
}

export function parseOrderCookie(value: string | undefined | null): { id: string; token: string } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  const token = value.slice(dot + 1);
  if (!UUID.test(id) || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return { id, token };
}

/**
 * A salted hash of the visitor's IP address, used only to limit how many
 * reservations one visitor can hold at a time. The address itself is never stored.
 */
export function clientHash(ip: string): string {
  const salt = process.env.CRON_SECRET ?? "pixelwall";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
