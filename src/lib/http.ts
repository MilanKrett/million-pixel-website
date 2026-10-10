import type { NextRequest } from "next/server";
import { ORDER_COOKIE, ORDER_COOKIE_MAX_AGE, parseOrderCookie } from "@/lib/orders/tokens";

/** The visitor's IP address as reported by the hosting platform. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}

/**
 * Reject state-changing requests sent from other websites (CSRF). Browsers
 * always send Origin on POST/PUT/DELETE; it must match this site.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function noStoreJson(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
}

export function readOrderCookie(request: NextRequest) {
  return parseOrderCookie(request.cookies.get(ORDER_COOKIE)?.value);
}

export function orderCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ORDER_COOKIE_MAX_AGE,
  };
}
