import type { NextRequest } from "next/server";
import { saveSettings } from "@/lib/admin/manage";
import { requireStaffApi } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { revalidateSettings } from "@/lib/revalidate";

/** Save site settings: {values: {key: value, …}}. All are validated together. */
export async function POST(request: NextRequest) {
  const auth = await requireStaffApi(request, "admin");
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as { values?: Record<string, unknown> } | null;
  if (!body?.values || typeof body.values !== "object") return jsonError(400, "invalid");
  const result = await saveSettings(db(), body.values, { id: auth.session.user.id, label: auth.session.user.email });
  if (!result.ok) return jsonError(422, "invalid_settings", { errors: result.errors });
  if (result.changed.length) revalidateSettings();
  return noStoreJson({ ok: true, changed: result.changed });
}
