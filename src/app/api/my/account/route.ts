import { NextResponse, type NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth/current";
import { deleteAccount } from "@/lib/account/delete";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";

/** Delete my account and personal data. The body must repeat the e-mail address as confirmation. */
export async function DELETE(request: NextRequest) {
  const auth = await requireUserApi(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (typeof body?.confirm !== "string" || body.confirm.trim().toLowerCase() !== auth.session.user.email) {
    return jsonError(400, "confirm_mismatch");
  }
  const result = await deleteAccount(db(), auth.session.user.id);
  if (!result.ok) return jsonError(409, result.reason);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
