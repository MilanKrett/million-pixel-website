import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/account/PrintButton";
import { intlLocale, localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { getSession } from "@/lib/auth/current";
import { getSiteSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { pixelRange } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { sellerLine } from "@/lib/site-info";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("receipt.title"), robots: { index: false } };
}

export default function ReceiptPage({ params }: PageProps<"/[locale]/my-pixels/receipt/[id]">) {
  return (
    <div className="content receipt">
      <Suspense fallback={<p>…</p>}>
        <Receipt params={params} />
      </Suspense>
    </div>
  );
}

/** A receipt the payer can print or save as PDF. Only the payer sees it, also after a transfer. */
async function Receipt({ params }: { params: PageProps<"/[locale]/my-pixels/receipt/[id]">["params"] }) {
  const [{ id }, session, locale, settings, t] = await Promise.all([params, getSession(), getLocale(), getSiteSettings(), getTranslator()]);
  if (!session) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(localePath(locale, `/my-pixels/receipt/${id}`))}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db()<
    { invoice_number: string | null; amount_cents: number; refunded_cents: number; paid_at: Date | null; status: string; buyer_email: string | null; x: number; y: number; w: number; h: number; no: number }[]
  >`
    select p.invoice_number, p.amount_cents, p.refunded_cents, p.paid_at, p.status, p.buyer_email,
           r.x, r.y, r.w, r.h, r.no
    from payments p join rentals r on r.id = p.rental_id
    where p.id = ${id} and p.status in ('paid', 'refunded', 'partially_refunded')
      and (p.buyer_email = ${session.user.email} or (p.buyer_email is null and r.user_id = ${session.user.id}))
  `;
  if (!p) notFound();
  const il = intlLocale(locale);
  const block = settings.block_size_px;
  const range = pixelRange(p, block);
  const money = (cents: number) => formatMoney(cents, settings.currency, il);
  const vat = settings.vat_payer ? Math.round((p.amount_cents * settings.vat_rate_pct) / (100 + settings.vat_rate_pct)) : 0;
  const seller = sellerLine(settings, (id) => t("receipt.companyId", { id }), t("legal.todo"));
  const rows: [string, string][] = [
    [t("receipt.number"), p.invoice_number ?? "—"],
    [t("receipt.date"), p.paid_at ? new Intl.DateTimeFormat(il, { dateStyle: "long", timeZone: "Europe/Bratislava" }).format(p.paid_at) : "—"],
    [t("receipt.seller"), seller],
    [t("receipt.buyer"), p.buyer_email ?? session.user.email],
    [
      t("receipt.item"),
      t("receipt.itemValue", { w: p.w * block, h: p.h * block, x0: range.x0, x1: range.x1, y0: range.y0, y1: range.y1, no: p.no }),
    ],
    [t("receipt.total"), money(p.amount_cents)],
    [t("receipt.vat"), settings.vat_payer ? t("receipt.vatIncluded", { rate: settings.vat_rate_pct, vat: money(vat) }) : t("receipt.notVatPayer")],
  ];
  if (p.refunded_cents > 0) rows.push([t("receipt.refunded"), money(p.refunded_cents)]);

  return (
    <>
      <h1>
        {t("receipt.title")} {p.invoice_number}
      </h1>
      <table className="data receipt-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="no-print">
        <PrintButton label={t("receipt.print")} /> <a href={localePath(locale, "/my-pixels")}>« {t("mine.backToList")}</a>
      </p>
    </>
  );
}
