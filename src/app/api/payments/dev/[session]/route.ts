import { randomBytes } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { isLocale, localePath, type Locale } from "@/i18n/config";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";
import { runChecksForRental } from "@/lib/moderation/checks";
import { completeCheckout, expireCheckout } from "@/lib/orders/checkout";
import { extensionPath } from "@/lib/orders/extension";
import { notifyExtended, notifyExtensionRefunded, notifyLateRefund, notifyPaid } from "@/lib/orders/notify";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { revalidateWall } from "@/lib/revalidate";

/**
 * The test payment page's buttons. "Pay" goes through completeCheckout(),
 * exactly like a Stripe webhook will once Stripe is connected. Afterwards the
 * buyer returns where Stripe would send them (order thanks page, or the
 * extension page).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/payments/dev/[session]">) {
  if (!isDevPaymentsAllowed() || (process.env.PAYMENT_PROVIDER ?? "dev") !== "dev") {
    return new Response("Not found", { status: 404 });
  }
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const { session } = await ctx.params;
  const form = await request.formData();
  const action = form.get("action");

  const [payment] = await db()<{ amount_cents: number; rental_id: string; kind: "new" | "extension"; no: number; locale: Locale }[]>`
    select p.amount_cents, p.rental_id, p.kind, r.no, r.locale
    from payments p join rentals r on r.id = p.rental_id
    where p.stripe_session_id = ${session} and p.provider = 'dev'
  `;
  if (!payment) return new Response("Not found", { status: 404 });
  // The language of the payment page the buyer saw.
  const pageLocale = form.get("locale");
  const locale = isLocale(pageLocale) ? pageLocale : payment.locale;
  const go = (path: string) => Response.redirect(new URL(path, request.url), 303);
  const extensionPage = () => extensionPath(locale, payment.no, payment.rental_id);

  if (action === "pay") {
    const result = await completeCheckout(db(), session, {
      amountCents: payment.amount_cents,
      paymentRef: `dev_pi_${randomBytes(12).toString("base64url")}`,
    });
    revalidateWall();
    if (result.outcome === "paid") {
      after(async () => {
        await notifyPaid(db(), payment.rental_id);
        await runChecksForRental(db(), payment.rental_id);
      });
      return go(localePath(locale, "/rent/thanks"));
    }
    if (result.outcome === "extended") {
      after(() => notifyExtended(db(), payment.rental_id, session));
      return go(`${extensionPage()}&paid=1`);
    }
    if (result.outcome === "refunded") {
      if (payment.kind === "extension") {
        after(() => notifyExtensionRefunded(db(), payment.rental_id, session));
        return go(extensionPage());
      }
      after(() => notifyLateRefund(db(), payment.rental_id));
      return go(`${localePath(locale, "/rent/thanks")}?refunded=1`);
    }
    return go(payment.kind === "extension" ? extensionPage() : localePath(locale, "/rent/thanks"));
  }
  if (action === "expire") {
    await expireCheckout(db(), session);
    revalidateWall();
    return go(payment.kind === "extension" ? extensionPage() : localePath(locale, "/rent"));
  }
  // "Cancel": back to the order (the reservation keeps running until it expires) or to the extension.
  return go(payment.kind === "extension" ? extensionPage() : localePath(locale, "/rent"));
}
