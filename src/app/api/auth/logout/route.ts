import { NextResponse, type NextRequest } from "next/server";
import { deleteSession, parseSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError } from "@/lib/http";
import { safeNextPath } from "@/lib/auth/login";

/** Sign out: the session row is deleted, so the cookie is worthless even if copied. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  await deleteSession(db(), parseSessionToken(request.cookies.get(SESSION_COOKIE)?.value));
  const form = request.headers.get("content-type")?.includes("form") ? await request.formData() : null;
  const next = safeNextPath(form?.get("next")) ?? "/";
  const response = form ? NextResponse.redirect(new URL(next, request.url), 303) : NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
