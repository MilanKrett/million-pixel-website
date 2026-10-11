import { randomBytes } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { localePath, type Locale } from "@/i18n/config";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";
import { runChecksForRental } from "@/lib/moderation/checks";
import { completeCheckout, expireCheckout } from "@/lib/orders/checkout";
import { notifyLateRefund, notifyPaid } from "@/lib/orders/notify";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { revalidateWall } from "@/lib/revalidate";

/**
 * The test payment page's buttons. "Pay" goes through completeCheckout(),
 * exactly like a Stripe webhook will once Stripe is connected.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/payments/dev/[session]">) {
  if (!isDevPaymentsAllowed() || (process.env.PAYMENT_PROVIDER ?? "dev") !== "dev") {
    return new Response("Not found", { status: 404 });
  }
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const { session } = await ctx.params;
  const form = await request.formData();
  const action = form.get("action");

  const [payment] = await db()<{ amount_cents: number; rental_id: string; locale: Locale }[]>`
    select p.amount_cents, p.rental_id, r.locale
    from payments p join rentals r on r.id = p.rental_id
    where p.stripe_session_id = ${session} and p.provider = 'dev'
  `;
  if (!payment) return new Response("Not found", { status: 404 });
  const go = (path: string) => Response.redirect(new URL(localePath(payment.locale, path), request.url), 303);

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
      return go("/rent/thanks");
    }
    if (result.outcome === "refunded") {
      after(() => notifyLateRefund(db(), payment.rental_id));
      return go("/rent/thanks?refunded=1");
    }
    return go("/rent/thanks");
  }
  if (action === "expire") {
    await expireCheckout(db(), session);
    revalidateWall();
    return go("/rent");
  }
  // "Cancel": back to the order; the reservation keeps running until it expires.
  return go("/rent");
}
