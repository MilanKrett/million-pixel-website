import { createTranslator } from "use-intl/core";
import { getMessages, intlLocale, localePath, TIME_ZONE, type Locale } from "@/i18n/config";
import { pixelRange, type Rect } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import type { Settings } from "@/lib/settings/schema";

/**
 * E-mails in the site's retro style: plain HTML tables with inline styles
 * (what e-mail clients understand) plus a plain-text version. All texts come
 * from the translation files (namespace "email").
 */

export interface RentalEmailData {
  locale: Locale;
  to: string;
  rect: Rect;
  years: number;
  title: string;
  amountCents: number;
  invoiceNumber?: string | null;
  paidAt?: Date | null;
  endsAt?: Date | null;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function context(settings: Settings, data: RentalEmailData) {
  const t = createTranslator({ locale: intlLocale(data.locale), messages: getMessages(data.locale), timeZone: TIME_ZONE, namespace: "email" });
  const il = intlLocale(data.locale);
  const block = settings.block_size_px;
  const range = pixelRange(data.rect, block);
  const position = t("position", { x0: range.x0, x1: range.x1, y0: range.y0, y1: range.y1 });
  const size = t("size", { w: data.rect.w * block, h: data.rect.h * block });
  const money = (cents: number) => formatMoney(cents, settings.currency, il);
  const date = (d: Date) => new Intl.DateTimeFormat(il, { dateStyle: "long", timeZone: TIME_ZONE }).format(d);
  const base = siteUrl();
  const spotUrl = `${base}${localePath(data.locale, "/")}?x=${data.rect.x}&y=${data.rect.y}&zoom=4`;
  return { t, position, size, money, date, base, spotUrl };
}

function layout(settings: Settings, locale: Locale, heading: string, bodyHtml: string): string {
  const t = createTranslator({ locale: intlLocale(locale), messages: getMessages(locale), timeZone: TIME_ZONE, namespace: "email" });
  const base = siteUrl();
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font:13px/1.5 Verdana,Tahoma,Arial,sans-serif;color:#000000;">
<tr><td style="padding:0 0 8px;border-bottom:1px solid #cccccc;"><a href="${esc(base)}" style="color:#000000;text-decoration:none;font:bold 22px Verdana,Tahoma,Arial,sans-serif;">${esc(settings.site_name)}</a></td></tr>
<tr><td style="padding:14px 0;">
<h1 style="margin:0 0 12px;font:bold 16px Verdana,Tahoma,Arial,sans-serif;">${esc(heading)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:8px 0 0;border-top:1px solid #cccccc;color:#555555;font-size:11px;">${esc(t("footer", { site: settings.site_name }))}<br><a href="${esc(base)}" style="color:#0000ee;">${esc(base)}</a></td></tr>
</table></td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 10px;">${html}</p>`;
const link = (href: string, text: string) => `<a href="${esc(href)}" style="color:#0000ee;">${esc(text)}</a>`;
const button = (href: string, text: string) =>
  `<p style="margin:14px 0;"><a href="${esc(href)}" style="display:inline-block;padding:6px 14px;background:#e8590c;border:1px solid #b8440a;color:#ffffff;font-weight:bold;text-decoration:none;">${esc(text)}</a></p>`;

function table(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px;width:100%;font-size:12px;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="border:1px solid #cccccc;padding:4px 6px;background:#f6f6f6;width:35%;vertical-align:top;">${esc(k)}</td><td style="border:1px solid #cccccc;padding:4px 6px;vertical-align:top;">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

const textTable = (rows: [string, string][]) => rows.map(([k, v]) => `${k}: ${v}`).join("\n");

/** Payment received: confirmation, receipt and what happens next. */
export function orderPaidEmail(settings: Settings, data: RentalEmailData): BuiltEmail {
  const { t, position, size, money, date } = context(settings, data);
  const subject = t("paid.subject");
  const rental: [string, string][] = [
    [t("labels.title"), data.title],
    [t("labels.position"), position],
    [t("labels.size"), size],
    [t("labels.period"), t("years", { years: data.years })],
  ];
  const vatCents = settings.vat_payer
    ? Math.round((data.amountCents * settings.vat_rate_pct) / (100 + settings.vat_rate_pct))
    : 0;
  const receipt: [string, string][] = [
    [t("labels.number"), data.invoiceNumber ?? "—"],
    [t("labels.date"), date(data.paidAt ?? new Date())],
    [
      t("labels.seller"),
      [settings.operator_name, settings.operator_id && t("companyId", { id: settings.operator_id }), settings.operator_address, settings.contact_email]
        .filter(Boolean)
        .join(", "),
    ],
    [t("labels.buyer"), data.to],
    [t("labels.item"), t("item", { w: data.rect.w * settings.block_size_px, h: data.rect.h * settings.block_size_px, position, years: data.years })],
    [t("labels.total"), money(data.amountCents)],
    [
      t("labels.vat"),
      settings.vat_payer ? t("vatIncluded", { rate: settings.vat_rate_pct, vat: money(vatCents) }) : t("notVatPayer"),
    ],
  ];
  const minePath = `${siteUrl()}${localePath(data.locale, "/my-pixels")}`;
  const html = layout(
    settings,
    data.locale,
    subject,
    [
      p(esc(t("greeting"))),
      p(esc(t("paid.intro", { amount: money(data.amountCents), hours: settings.review_hours }))),
      p(esc(t("paid.start"))),
      `<h2 style="margin:16px 0 6px;font:bold 13px Verdana,Tahoma,Arial,sans-serif;">${esc(t("paid.rentalHeading"))}</h2>`,
      table(rental),
      `<h2 style="margin:16px 0 6px;font:bold 13px Verdana,Tahoma,Arial,sans-serif;">${esc(t("paid.receiptHeading"))}</h2>`,
      table(receipt),
      p(`${esc(t("paid.mine"))} ${link(minePath, minePath)}`),
    ].join("\n"),
  );
  const text = [
    t("greeting"),
    "",
    t("paid.intro", { amount: money(data.amountCents), hours: settings.review_hours }),
    t("paid.start"),
    "",
    t("paid.rentalHeading"),
    textTable(rental),
    "",
    t("paid.receiptHeading"),
    textTable(receipt),
    "",
    `${t("paid.mine")} ${minePath}`,
    "",
    t("footer", { site: settings.site_name }),
  ].join("\n");
  return { subject, html, text };
}

/** Content approved: the pixels are on the wall. */
export function approvedEmail(settings: Settings, data: RentalEmailData): BuiltEmail {
  const { t, position, date, spotUrl } = context(settings, data);
  const subject = t("approved.subject");
  const shareText = t("approved.shareText", { site: settings.site_name });
  const shares: [string, string][] = [
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(spotUrl)}`],
    ["X", `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(spotUrl)}`],
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${shareText} ${spotUrl}`)}`],
    [t("approved.shareEmail"), `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(spotUrl)}`],
  ];
  const until = data.endsAt ? date(data.endsAt) : "";
  const html = layout(
    settings,
    data.locale,
    subject,
    [
      p(esc(t("greeting"))),
      p(esc(t("approved.intro", { title: data.title, position, until }))),
      button(spotUrl, t("approved.see")),
      p(`${esc(t("approved.share"))} ${shares.map(([name, href]) => link(href, name)).join(" | ")}`),
    ].join("\n"),
  );
  const text = [
    t("greeting"),
    "",
    t("approved.intro", { title: data.title, position, until }),
    "",
    `${t("approved.see")}: ${spotUrl}`,
    "",
    t("approved.share"),
    ...shares.map(([name, href]) => `${name}: ${href}`),
    "",
    t("footer", { site: settings.site_name }),
  ].join("\n");
  return { subject, html, text };
}

/** Payment arrived after the reservation ended and the space was taken: full refund. */
export function lateRefundEmail(settings: Settings, data: RentalEmailData): BuiltEmail {
  const { t, money } = context(settings, data);
  const subject = t("lateRefund.subject");
  const rentUrl = `${siteUrl()}${localePath(data.locale, "/rent")}`;
  const html = layout(
    settings,
    data.locale,
    subject,
    [
      p(esc(t("greeting"))),
      p(esc(t("lateRefund.intro", { amount: money(data.amountCents) }))),
      p(esc(t("lateRefund.refund"))),
      button(rentUrl, t("lateRefund.again")),
    ].join("\n"),
  );
  const text = [
    t("greeting"),
    "",
    t("lateRefund.intro", { amount: money(data.amountCents) }),
    t("lateRefund.refund"),
    "",
    `${t("lateRefund.again")}: ${rentUrl}`,
    "",
    t("footer", { site: settings.site_name }),
  ].join("\n");
  return { subject, html, text };
}
