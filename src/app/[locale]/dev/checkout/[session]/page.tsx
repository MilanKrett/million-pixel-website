import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { intlLocale, localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { db } from "@/lib/db";
import { pixelRange } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { loadSettings } from "@/lib/settings/load";

export const metadata: Metadata = { title: "Test payment", robots: { index: false } };
export const instant = false;

/**
 * Stand-in for the Stripe Checkout page while Stripe is not connected.
 * No money moves; "Pay" runs the same code a Stripe webhook will run.
 */
export default function DevCheckoutPage({ params }: PageProps<"/[locale]/dev/checkout/[session]">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Checkout params={params} />
    </Suspense>
  );
}

async function Checkout({ params }: { params: PageProps<"/[locale]/dev/checkout/[session]">["params"] }) {
  if (!isDevPaymentsAllowed() || (process.env.PAYMENT_PROVIDER ?? "dev") !== "dev") notFound();
  const { session } = await params;
  const locale = await getLocale();
  const t = await getTranslator(locale);
  const [payment] = await db()<
    {
      amount_cents: number;
      currency: string;
      status: string;
      email: string | null;
      x: number;
      y: number;
      w: number;
      h: number;
      title: string | null;
    }[]
  >`
    select p.amount_cents, p.currency, p.status, r.email, r.x, r.y, r.w, r.h,
           coalesce(
             (select title from content_versions c where c.id = r.active_content_id),
             (select title from content_versions c where c.rental_id = r.id order by created_at desc limit 1)
           ) as title
    from payments p join rentals r on r.id = p.rental_id
    where p.stripe_session_id = ${session} and p.provider = 'dev'
  `;
  if (!payment) notFound();
  const settings = await loadSettings(db());
  const range = pixelRange(payment, settings.block_size_px);
  const amount = formatMoney(payment.amount_cents, payment.currency, intlLocale(locale));
  const action = `/api/payments/dev/${encodeURIComponent(session)}`;

  return (
    <div className="content dev-checkout">
      <h1>{t("devCheckout.title")}</h1>
      <div className="notice">
        <p>
          <b>{t("devCheckout.warning")}</b>
        </p>
        <p>{t("devCheckout.explain")}</p>
      </div>
      <table className="data">
        <tbody>
          <tr>
            <th scope="row">{t("devCheckout.item")}</th>
            <td>
              {payment.title} — {payment.w * settings.block_size_px} × {payment.h * settings.block_size_px} px (x {range.x0}–{range.x1}, y{" "}
              {range.y0}–{range.y1})
            </td>
          </tr>
          <tr>
            <th scope="row">{t("devCheckout.email")}</th>
            <td>{payment.email}</td>
          </tr>
          <tr>
            <th scope="row">{t("devCheckout.amount")}</th>
            <td>
              <b>{amount}</b>
            </td>
          </tr>
          <tr>
            <th scope="row">{t("devCheckout.status")}</th>
            <td>{payment.status}</td>
          </tr>
        </tbody>
      </table>
      {payment.status === "pending" ? (
        <div className="dev-actions">
          <form method="post" action={action}>
            <input type="hidden" name="action" value="pay" />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="btn btn-rent btn-big">
              {t("devCheckout.pay", { amount })}
            </button>
          </form>
          <form method="post" action={action}>
            <input type="hidden" name="action" value="cancel" />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="btn">
              {t("devCheckout.cancel")}
            </button>
          </form>
          <form method="post" action={action}>
            <input type="hidden" name="action" value="expire" />
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="btn">
              {t("devCheckout.expire")}
            </button>
          </form>
        </div>
      ) : (
        <p>
          <a href={localePath(locale, "/buy")}>{t("devCheckout.back")}</a>
        </p>
      )}
    </div>
  );
}
