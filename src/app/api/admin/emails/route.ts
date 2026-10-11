import type { NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { saveEmailText } from "@/lib/admin/manage";
import { requireStaffApi } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";

/** Change one e-mail text: {locale, key, value}; an empty value goes back to the original. */
export async function POST(request: NextRequest) {
  const auth = await requireStaffApi(request, "admin");
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isLocale(body.locale) || typeof body.key !== "string") return jsonError(400, "invalid");
  const result = await saveEmailText(db(), body.locale, body.key, typeof body.value === "string" ? body.value : null, {
    id: auth.session.user.id,
    label: auth.session.user.email,
  });
  if (!result.ok) return jsonError(422, result.reason, { detail: result.detail ?? null });
  return noStoreJson({ ok: true });
}
