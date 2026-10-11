import type { NextRequest } from "next/server";
import { localePath } from "@/i18n/config";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/email/templates";
import { jsonError, noStoreJson } from "@/lib/http";
import { startCheckout } from "@/lib/orders/checkout";
import { authorizeOrder } from "@/lib/orders/request";
import { loadSettings } from "@/lib/settings/load";

/** Step 6: create a payment session and return where to send the buyer. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { rentalId?: string } | null;
  if (!body?.rentalId) return jsonError(400, "invalid");
  const auth = await authorizeOrder(request, body.rentalId, { mutate: true });
  if ("error" in auth) return auth.error;

  const settings = await loadSettings(db());
  const locale = auth.rental.locale;
  const base = siteUrl();
  const result = await startCheckout(db(), settings, body.rentalId, {
    success: `${base}${localePath(locale, "/buy/thanks")}`,
    cancel: `${base}${localePath(locale, "/buy")}`,
  });
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "sales_paused" ? 503 : 409;
    return jsonError(status, result.reason);
  }
  return noStoreJson({ url: result.url, amountCents: result.amountCents });
}
