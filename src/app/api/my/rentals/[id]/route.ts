import { after, type NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { submitContentChange } from "@/lib/account/changes";
import { cancelTransfer, startTransfer } from "@/lib/account/transfer";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { isLinkUnsafe, runAutoChecks } from "@/lib/moderation/checks";
import { validateTexts } from "@/lib/orders/order";
import { authorizeRental } from "@/lib/orders/request";

/**
 * My pixels: actions of the signed-in owner on one rental.
 *   {action: "submit", contentId?, title, url, displayName}  send a change for review
 *   {action: "transfer", email, locale}                     offer the rental to someone else
 *   {action: "cancelTransfer"}
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/my/rentals/[id]">) {
  const { id } = await ctx.params;
  const auth = await authorizeRental(request, id, { mutate: true });
  if ("error" in auth) return auth.error;
  if (auth.access !== "owner" || !auth.session) return jsonError(404, "not_found");
  const { session } = auth;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "invalid");
  const sql = db();

  switch (body.action) {
    case "submit": {
      const texts = validateTexts({ title: body.title, url: body.url, displayName: body.displayName });
      if (texts.ok && (await isLinkUnsafe(texts.texts.url))) return jsonError(422, "invalid_details", { errors: { url: "urlUnsafe" } });
      const result = await submitContentChange(sql, id, body as Parameters<typeof submitContentChange>[2], {
        id: session.user.id,
        label: session.user.email,
      });
      if (!result.ok) {
        if (result.reason === "invalid") return jsonError(422, "invalid_details", { errors: result.errors });
        return jsonError(409, result.reason);
      }
      after(() => runAutoChecks(db(), result.contentId));
      return noStoreJson({ ok: true, contentId: result.contentId });
    }
    case "transfer": {
      const result = await startTransfer(sql, {
        rentalId: id,
        owner: session.user,
        toEmail: body.email,
        locale: isLocale(body.locale) ? body.locale : session.user.locale,
      });
      if (!result.ok) return jsonError(result.reason === "rate_limited" ? 429 : 400, result.reason);
      return noStoreJson({ ok: true });
    }
    case "cancelTransfer": {
      await cancelTransfer(sql, id, session.user.id);
      return noStoreJson({ ok: true });
    }
    default:
      return jsonError(400, "invalid");
  }
}
