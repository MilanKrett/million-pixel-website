import type { NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { sessionFromRequest } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/email/templates";
import { clientIp, isSameOrigin, jsonError, noStoreJson } from "@/lib/http";
import { extensionKeyMatches, extensionPath, loadExtension, startExtensionCheckout } from "@/lib/orders/extension";
import { clientHash } from "@/lib/orders/tokens";
import { hit } from "@/lib/rate-limit";
import { loadSettings } from "@/lib/settings/load";

/**
 * Start paying for an extension: {no, key?, years, terms, waiver, locale}.
 * Allowed with the key from the reminder e-mail or for the signed-in owner.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const no = Number(body?.no);
  if (!body || !Number.isSafeInteger(no) || no <= 0) return jsonError(400, "invalid");
  const locale = isLocale(body.locale) ? body.locale : "en";

  const sql = db();
  if (!(await hit(sql, "extend", clientHash(clientIp(request)), 20, 3600))) return jsonError(429, "rate_limited");
  const settings = await loadSettings(sql);
  const state = await loadExtension(sql, settings, no);
  if (!state) return jsonError(404, "not_found");
  const session = await sessionFromRequest(request);
  const allowed = extensionKeyMatches(state.id, typeof body.key === "string" ? body.key : null) || (session !== null && session.user.id === state.userId);
  if (!allowed) return jsonError(404, "not_found");

  const page = `${siteUrl()}${extensionPath(locale, state.no, state.id)}`;
  const result = await startExtensionCheckout(
    sql,
    settings,
    state.id,
    { years: Number(body.years), terms: body.terms === true, waiver: body.waiver === true, locale },
    { success: `${page}&paid=1`, cancel: page },
  );
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "sales_paused" ? 503 : result.reason === "consent_required" || result.reason === "invalid_period" ? 400 : 409;
    return jsonError(status, result.reason);
  }
  return noStoreJson({ url: result.url, amountCents: result.amountCents });
}
