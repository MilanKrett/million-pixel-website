import { NextResponse, type NextRequest } from "next/server";
import { localePath } from "@/i18n/config";
import { isStaff } from "@/lib/auth/accounts";
import { sessionCookieOptions } from "@/lib/auth/current";
import { consumeLoginToken } from "@/lib/auth/login";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError } from "@/lib/http";

/** Use a sign-in link (the button on /login/confirm): creates the session cookie. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid");
  }
  const result = await consumeLoginToken(db(), body.token);
  if (!result) return jsonError(400, "link_invalid");
  const fallback = isStaff(result.user.role) && result.next?.startsWith("/admin") ? "/admin" : localePath(result.locale, "/my-pixels");
  const response = NextResponse.json({ next: result.next ?? fallback }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(result.sessionExpires));
  return response;
}
