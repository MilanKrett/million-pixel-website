import type { NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { sessionFromRequest } from "@/lib/auth/current";
import { isStaff } from "@/lib/auth/accounts";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError, noStoreJson } from "@/lib/http";

/** Language of the admin for the signed-in staff member (also used for their e-mails). */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  const session = await sessionFromRequest(request);
  if (!session || !isStaff(session.user.role)) return jsonError(401, "unauthorized");
  const body = (await request.json().catch(() => null)) as { locale?: unknown } | null;
  if (!isLocale(body?.locale)) return jsonError(400, "invalid");
  await db()`update users set locale = ${body.locale} where id = ${session.user.id}`;
  return noStoreJson({ ok: true });
}
