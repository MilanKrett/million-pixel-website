import { NextResponse, type NextRequest } from "next/server";
import { localePath } from "@/i18n/config";
import { acceptTransfer } from "@/lib/account/transfer";
import { sessionCookieOptions } from "@/lib/auth/current";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError } from "@/lib/http";

/** Accept a rental someone gave you (button on /transfer): you become its owner and are signed in. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const result = await acceptTransfer(db(), body?.token);
  if (!result.ok) return jsonError(400, "link_invalid");
  const response = NextResponse.json({ next: localePath(result.locale, "/my-pixels") }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(result.sessionExpires));
  return response;
}
