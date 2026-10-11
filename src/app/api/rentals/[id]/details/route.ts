import type { NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { latestDraft, saveDetails, validateDetails, type DetailsInput } from "@/lib/orders/order";
import { orderResponse } from "@/lib/orders/order-response";
import { authorizeOrder } from "@/lib/orders/request";
import { isLinkUnsafe } from "@/lib/moderation/checks";
import { loadSettings } from "@/lib/settings/load";

/** Step 4: title, link, public name, e-mail and consents. */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/rentals/[id]/details">) {
  const { id } = await ctx.params;
  const auth = await authorizeOrder(request, id, { mutate: true, editable: true });
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as (DetailsInput & { locale?: unknown }) | null;
  if (!body) return jsonError(400, "invalid");
  const settings = await loadSettings(db());
  const result = validateDetails(body);
  if (!result.ok) return jsonError(422, "invalid_details", { errors: result.errors });
  // A page listed as dangerous cannot be saved (spec section 15).
  if (await isLinkUnsafe(result.details.url)) return jsonError(422, "invalid_details", { errors: { url: "urlUnsafe" } });

  const draft = await latestDraft(db(), id);
  if (!draft) return jsonError(409, "no_content");
  await saveDetails(db(), id, draft.id, result.details, isLocale(body.locale) ? body.locale : auth.rental.locale);

  const fresh = await authorizeOrder(request, id);
  if ("error" in fresh) return fresh.error;
  return noStoreJson({ order: await orderResponse(db(), settings, fresh.rental) });
}
