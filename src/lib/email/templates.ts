import { createTranslator } from "use-intl/core";
import { intlLocale, localePath, TIME_ZONE, type Locale, type Messages } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { pixelRange, type Rect } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import type { Settings } from "@/lib/settings/schema";
import type { ReasonCode } from "./reasons";

/**
 * E-mails in the site's retro style: plain HTML tables with inline styles
 * (what e-mail clients understand) plus a plain-text version, both built from
 * the same blocks. Texts come from the translation files (namespace "email");
 * the admin can override any of them (table email_texts).
 */

/** Overridden texts per language: "paid.subject" → "…". */
export type EmailTexts = Partial<Record<Locale, Record<string, string>>>;

export interface EmailEnv {
  settings: Settings;
  texts?: EmailTexts;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export interface RentalEmailData {
  locale: Locale;
  to: string;
  no?: number;
  rect: Rect;
  years: number;
  title: string;
  amountCents: number;
  invoiceNumber?: string | null;
  paidAt?: Date | null;
  endsAt?: Date | null;
}

export { REASON_CODES, type ReasonCode } from "./reasons";

export interface DecisionData extends RentalEmailData {
  reasonCode: ReasonCode;
  note?: string | null;
}

export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Set "a.b.c" inside a copy of a nested object. */
function withOverrides(base: Messages["email"], overrides: Record<string, string> | undefined): Messages["email"] {
  if (!overrides || Object.keys(overrides).length === 0) return base;
  const copy = structuredClone(base) as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    const parts = key.split(".");
    let node = copy;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== "object" || node[part] === null) {
        node = {};
        break;
      }
      node = node[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1]!;
    if (typeof node[last] === "string") node[last] = value;
  }
  return copy as unknown as Messages["email"];
}

export function emailTranslator(env: EmailEnv, locale: Locale) {
  const messages = getMessages(locale);
  return createTranslator({
    locale: intlLocale(locale),
    messages: { email: withOverrides(messages.email, env.texts?.[locale]) },
    timeZone: TIME_ZONE,
    namespace: "email",
  });
}

function reasonLabel(locale: Locale, code: ReasonCode): string {
  const t = createTranslator({ locale: intlLocale(locale), messages: getMessages(locale), timeZone: TIME_ZONE, namespace: "reasons" });
  return t(code);
}

function context(env: EmailEnv, locale: Locale, rect?: Rect) {
  const t = emailTranslator(env, locale);
  const il = intlLocale(locale);
  const block = env.settings.block_size_px;
  const range = rect ? pixelRange(rect, block) : null;
  const position = range ? t("position", { x0: range.x0, x1: range.x1, y0: range.y0, y1: range.y1 }) : "";
  const size = rect ? t("size", { w: rect.w * block, h: rect.h * block }) : "";
  const money = (cents: number) => formatMoney(cents, env.settings.currency, il);
  const date = (d: Date) => new Intl.DateTimeFormat(il, { dateStyle: "long", timeZone: TIME_ZONE }).format(d);
  const base = siteUrl();
  const page = (path: string) => `${base}${localePath(locale, path)}`;
  const spotUrl = rect ? `${page("/")}?x=${rect.x}&y=${rect.y}&zoom=4` : page("/");
  return { t, position, size, money, date, base, page, spotUrl };
}

// ---------------------------------------------------------------------------
// Building blocks → HTML and plain text
// ---------------------------------------------------------------------------

type Block =
  | { p: string }
  | { p: string; url: string }
  | { h: string }
  | { table: [string, string][] }
  | { button: string; href: string }
  | { label: string; links: [string, string][] }
  | { quote: string };

const FONT = "Verdana,Tahoma,Arial,sans-serif";

function blockHtml(b: Block): string {
  if ("button" in b) {
    return `<p style="margin:14px 0;"><a href="${esc(b.href)}" style="display:inline-block;padding:6px 14px;background:#e8590c;border:1px solid #b8440a;color:#ffffff;font-weight:bold;text-decoration:none;">${esc(b.button)}</a></p>`;
  }
  if ("h" in b) return `<h2 style="margin:16px 0 6px;font:bold 13px ${FONT};">${esc(b.h)}</h2>`;
  if ("table" in b) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px;width:100%;font-size:12px;">${b.table
      .map(
        ([k, v]) =>
          `<tr><td style="border:1px solid #cccccc;padding:4px 6px;background:#f6f6f6;width:35%;vertical-align:top;">${esc(k)}</td><td style="border:1px solid #cccccc;padding:4px 6px;vertical-align:top;">${esc(v)}</td></tr>`,
      )
      .join("")}</table>`;
  }
  if ("links" in b) {
    const links = b.links.map(([name, href]) => `<a href="${esc(href)}" style="color:#0000ee;">${esc(name)}</a>`).join(" | ");
    return `<p style="margin:0 0 10px;">${esc(b.label)} ${links}</p>`;
  }
  if ("quote" in b) {
    return `<p style="margin:0 0 10px;padding:6px 10px;border-left:3px solid #cccccc;background:#f6f6f6;white-space:pre-wrap;">${esc(b.quote)}</p>`;
  }
  if ("url" in b) return `<p style="margin:0 0 10px;">${esc(b.p)} <a href="${esc(b.url)}" style="color:#0000ee;">${esc(b.url)}</a></p>`;
  return `<p style="margin:0 0 10px;">${esc(b.p)}</p>`;
}

function blockText(b: Block): string {
  if ("button" in b) return `${b.button}: ${b.href}`;
  if ("h" in b) return `\n${b.h}`;
  if ("table" in b) return b.table.map(([k, v]) => `${k}: ${v}`).join("\n");
  if ("links" in b) return [b.label, ...b.links.map(([name, href]) => `${name}: ${href}`)].join("\n");
  if ("quote" in b) return b.quote.split("\n").map((l) => `> ${l}`).join("\n");
  if ("url" in b) return `${b.p} ${b.url}`;
  return b.p;
}

function compose(env: EmailEnv, locale: Locale, subject: string, blocks: Block[]): BuiltEmail {
  const t = emailTranslator(env, locale);
  const base = siteUrl();
  const footer = t("footer", { site: env.settings.site_name });
  const all: Block[] = [{ p: t("greeting") }, ...blocks];
  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr><td align="center" style="padding:16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font:13px/1.5 ${FONT};color:#000000;">
<tr><td style="padding:0 0 8px;border-bottom:1px solid #cccccc;"><a href="${esc(base)}" style="color:#000000;text-decoration:none;font:bold 22px ${FONT};">${esc(env.settings.site_name)}</a></td></tr>
<tr><td style="padding:14px 0;">
<h1 style="margin:0 0 12px;font:bold 16px ${FONT};">${esc(subject)}</h1>
${all.map(blockHtml).join("\n")}
</td></tr>
<tr><td style="padding:8px 0 0;border-top:1px solid #cccccc;color:#555555;font-size:11px;">${esc(footer)}<br><a href="${esc(base)}" style="color:#0000ee;">${esc(base)}</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [...all.map(blockText), "", footer].join("\n\n").replace(/\n{3,}/g, "\n\n");
  return { subject, html, text };
}

function decisionBlocks(env: EmailEnv, d: DecisionData): Block[] {
  const t = emailTranslator(env, d.locale);
  const blocks: Block[] = [{ p: t("reason", { reason: reasonLabel(d.locale, d.reasonCode) }) }];
  if (d.note?.trim()) blocks.push({ p: t("moderatorNote") }, { quote: d.note.trim() });
  return blocks;
}

function appealBlock(env: EmailEnv, d: { locale: Locale; no?: number }): Block {
  const t = emailTranslator(env, d.locale);
  return { p: t("appeal", { contact: env.settings.contact_email, no: d.no ?? 0 }) };
}

// ---------------------------------------------------------------------------
// The e-mails
// ---------------------------------------------------------------------------

/** One-time sign-in link. */
export function loginEmail(env: EmailEnv, d: { locale: Locale; url: string; minutes: number }): BuiltEmail {
  const { t } = context(env, d.locale);
  return compose(env, d.locale, t("login.subject", { site: env.settings.site_name }), [
    { p: t("login.intro", { minutes: d.minutes }) },
    { button: t("login.button"), href: d.url },
    { p: t("login.ignore") },
  ]);
}

/** Payment received: confirmation, receipt and what happens next. */
export function orderPaidEmail(env: EmailEnv, data: RentalEmailData): BuiltEmail {
  const { t, position, size, money, date, page } = context(env, data.locale, data.rect);
  const s = env.settings;
  const vatCents = s.vat_payer ? Math.round((data.amountCents * s.vat_rate_pct) / (100 + s.vat_rate_pct)) : 0;
  return compose(env, data.locale, t("paid.subject"), [
    { p: t("paid.intro", { amount: money(data.amountCents), hours: s.review_hours }) },
    { p: t("paid.start") },
    { h: t("paid.rentalHeading") },
    {
      table: [
        [t("labels.title"), data.title],
        [t("labels.position"), position],
        [t("labels.size"), size],
        [t("labels.period"), t("years", { years: data.years })],
      ],
    },
    { h: t("paid.receiptHeading") },
    {
      table: [
        [t("labels.number"), data.invoiceNumber ?? "—"],
        [t("labels.date"), date(data.paidAt ?? new Date())],
        [
          t("labels.seller"),
          [s.operator_name, s.operator_id && t("companyId", { id: s.operator_id }), s.operator_address, s.contact_email].filter(Boolean).join(", "),
        ],
        [t("labels.buyer"), data.to],
        [t("labels.item"), t("item", { w: data.rect.w * s.block_size_px, h: data.rect.h * s.block_size_px, position, years: data.years })],
        [t("labels.total"), money(data.amountCents)],
        [t("labels.vat"), s.vat_payer ? t("vatIncluded", { rate: s.vat_rate_pct, vat: money(vatCents) }) : t("notVatPayer")],
      ],
    },
    { p: t("paid.mine"), url: page("/my-pixels") },
  ]);
}

function shareLinks(env: EmailEnv, locale: Locale, spotUrl: string): [string, string][] {
  const t = emailTranslator(env, locale);
  const shareText = t("approved.shareText", { site: env.settings.site_name });
  return [
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(spotUrl)}`],
    ["X", `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(spotUrl)}`],
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${shareText} ${spotUrl}`)}`],
    [t("approved.shareEmail"), `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(spotUrl)}`],
  ];
}

/** Content of a new rental approved: the pixels are on the wall. */
export function approvedEmail(env: EmailEnv, data: RentalEmailData): BuiltEmail {
  const { t, position, date, spotUrl } = context(env, data.locale, data.rect);
  return compose(env, data.locale, t("approved.subject"), [
    { p: t("approved.intro", { title: data.title, position, until: data.endsAt ? date(data.endsAt) : "" }) },
    { button: t("approved.see"), href: spotUrl },
    { label: t("approved.share"), links: shareLinks(env, data.locale, spotUrl) },
  ]);
}

/** A change to a running rental was approved. */
export function changeApprovedEmail(env: EmailEnv, data: RentalEmailData): BuiltEmail {
  const { t, position, spotUrl } = context(env, data.locale, data.rect);
  return compose(env, data.locale, t("changeApproved.subject"), [
    { p: t("changeApproved.intro", { title: data.title, position }) },
    { button: t("approved.see"), href: spotUrl },
  ]);
}

/** Content of a new rental rejected, or changes requested: new content can be sent until `until`. */
export function rejectedEmail(env: EmailEnv, data: DecisionData & { until: Date; mode: "rejected" | "changes" }): BuiltEmail {
  const { t, position, date, page } = context(env, data.locale, data.rect);
  const key = data.mode === "changes" ? "changesRequested" : "rejected";
  return compose(env, data.locale, t(`${key}.subject`), [
    { p: t(`${key}.intro`, { title: data.title, position }) },
    ...decisionBlocks(env, data),
    { p: t("rejected.upload", { until: date(data.until) }) },
    { p: t("rejected.refundNote") },
    { button: t("rejected.button"), href: page("/my-pixels") },
    appealBlock(env, data),
  ]);
}

/** A change to a running rental was rejected; the old content stays. */
export function changeRejectedEmail(env: EmailEnv, data: DecisionData): BuiltEmail {
  const { t, position, page } = context(env, data.locale, data.rect);
  return compose(env, data.locale, t("changeRejected.subject"), [
    { p: t("changeRejected.intro", { title: data.title, position }) },
    ...decisionBlocks(env, data),
    { p: t("changeRejected.again") },
    { button: t("changeRejected.button"), href: page("/my-pixels") },
    appealBlock(env, data),
  ]);
}

export type RefundCause = "no_reupload" | "rejected" | "admin";

/** Money returned (no new content in time, rejected for good, or by the admin). */
export function refundedEmail(env: EmailEnv, data: RentalEmailData & { cause: RefundCause; refundCents: number }): BuiltEmail {
  const { t, position, money } = context(env, data.locale, data.rect);
  const intro = data.cause === "no_reupload" ? "refunded.noReupload" : data.cause === "rejected" ? "refunded.rejected" : "refunded.admin";
  return compose(env, data.locale, t("refunded.subject"), [
    { p: t(intro, { position, amount: money(data.refundCents), title: data.title }) },
    { p: t("refunded.bank") },
  ]);
}

/** Hidden by a moderator while a problem is looked into (statement of reasons, DSA art. 17). */
export function hiddenEmail(env: EmailEnv, data: DecisionData): BuiltEmail {
  const { t, position } = context(env, data.locale, data.rect);
  return compose(env, data.locale, t("hidden.subject"), [
    { p: t("hidden.intro", { title: data.title, position }) },
    ...decisionBlocks(env, data),
    { p: t("hidden.next") },
    appealBlock(env, data),
  ]);
}

/** Removed for breaking the rules (statement of reasons, DSA art. 17). */
export function removedEmail(env: EmailEnv, data: DecisionData): BuiltEmail {
  const { t, position } = context(env, data.locale, data.rect);
  return compose(env, data.locale, t("removed.subject"), [
    { p: t("removed.intro", { title: data.title, position }) },
    ...decisionBlocks(env, data),
    { p: t("removed.terms") },
    appealBlock(env, data),
  ]);
}

/** Payment arrived after the reservation ended and the space was taken: full refund. */
export function lateRefundEmail(env: EmailEnv, data: RentalEmailData): BuiltEmail {
  const { t, money, page } = context(env, data.locale, data.rect);
  return compose(env, data.locale, t("lateRefund.subject"), [
    { p: t("lateRefund.intro", { amount: money(data.amountCents) }) },
    { p: t("lateRefund.refund") },
    { button: t("lateRefund.again"), href: page("/rent") },
  ]);
}

/** To someone who reported content (when they left an address). */
export function reportReceivedEmail(env: EmailEnv, d: { locale: Locale; reference: string; no: number | null }): BuiltEmail {
  const { t } = context(env, d.locale);
  return compose(env, d.locale, t("reportReceived.subject", { reference: d.reference }), [
    { p: t("reportReceived.intro", { no: d.no ?? 0 }) },
    { p: t("reportReceived.reference", { reference: d.reference }) },
  ]);
}

export function reportDecidedEmail(
  env: EmailEnv,
  d: { locale: Locale; reference: string; no: number | null; outcome: "actioned" | "dismissed" },
): BuiltEmail {
  const { t } = context(env, d.locale);
  return compose(env, d.locale, t("reportDecided.subject", { reference: d.reference }), [
    { p: t(d.outcome === "actioned" ? "reportDecided.actioned" : "reportDecided.dismissed", { no: d.no ?? 0 }) },
    { p: t("reportDecided.thanks") },
  ]);
}

/** To the new owner of a rental that is being given away. */
export function transferOfferEmail(env: EmailEnv, data: RentalEmailData & { acceptUrl: string; days: number }): BuiltEmail {
  const { t, position, size, date } = context(env, data.locale, data.rect);
  return compose(env, data.locale, t("transferOffer.subject", { site: env.settings.site_name }), [
    {
      p: t("transferOffer.intro", {
        site: env.settings.site_name,
        title: data.title,
        size,
        position,
        until: data.endsAt ? date(data.endsAt) : "—",
      }),
    },
    { button: t("transferOffer.accept"), href: data.acceptUrl },
    { p: t("transferOffer.valid", { days: data.days }) },
  ]);
}

/** To the previous owner once the transfer was accepted. */
export function transferDoneEmail(env: EmailEnv, data: RentalEmailData & { newOwner: string }): BuiltEmail {
  const { t, position } = context(env, data.locale, data.rect);
  return compose(env, data.locale, t("transferDone.subject"), [{ p: t("transferDone.intro", { email: data.newOwner, title: data.title, position }) }]);
}

export function accountDeletedEmail(env: EmailEnv, d: { locale: Locale }): BuiltEmail {
  const { t } = context(env, d.locale);
  return compose(env, d.locale, t("accountDeleted.subject"), [{ p: t("accountDeleted.intro") }, { p: t("accountDeleted.rentals") }]);
}

/** Someone was made a moderator or admin. */
export function staffInviteEmail(env: EmailEnv, d: { locale: Locale; role: "moderator" | "admin" }): BuiltEmail {
  const { t, base } = context(env, d.locale);
  return compose(env, d.locale, t("staffInvite.subject", { site: env.settings.site_name }), [
    { p: t("staffInvite.intro", { role: d.role }) },
    { button: t("staffInvite.button"), href: `${base}/admin` },
  ]);
}

// ---------------------------------------------------------------------------
// Catalogue (admin preview and editing)
// ---------------------------------------------------------------------------

export const EMAIL_TEMPLATES = [
  "login",
  "paid",
  "approved",
  "changeApproved",
  "rejected",
  "changesRequested",
  "changeRejected",
  "refunded",
  "hidden",
  "removed",
  "lateRefund",
  "reportReceived",
  "reportDecided",
  "transferOffer",
  "transferDone",
  "accountDeleted",
  "staffInvite",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

/** Message keys a template uses besides its own group ("rejected.*" is shared by changesRequested). */
export const SHARED_EMAIL_KEYS: Partial<Record<EmailTemplate, string[]>> = {
  changesRequested: ["rejected.upload", "rejected.refundNote", "rejected.button"],
  changeApproved: ["approved.see"],
};

/** Every template built with sample data, for the admin preview. */
export function sampleEmail(env: EmailEnv, template: EmailTemplate, locale: Locale): BuiltEmail {
  const now = new Date();
  const later = new Date(now.getTime() + 365 * 86400_000);
  const rental: RentalEmailData = {
    locale,
    to: "jana@example.com",
    no: 1234,
    rect: { x: 34, y: 12, w: 5, h: 3 },
    years: 1,
    title: locale === "sk" ? "Pekáreň u Jany" : "Jane's Bakery",
    amountCents: 15_000,
    invoiceNumber: `${now.getFullYear()}-000123`,
    paidAt: now,
    endsAt: later,
  };
  const decision: DecisionData = { ...rental, reasonCode: "rights", note: locale === "sk" ? "Logo patrí inej firme." : "The logo belongs to another company." };
  const url = `${siteUrl()}${localePath(locale, "/login/confirm")}#sample`;
  switch (template) {
    case "login":
      return loginEmail(env, { locale, url, minutes: env.settings.magic_link_minutes });
    case "paid":
      return orderPaidEmail(env, rental);
    case "approved":
      return approvedEmail(env, rental);
    case "changeApproved":
      return changeApprovedEmail(env, rental);
    case "rejected":
      return rejectedEmail(env, { ...decision, until: new Date(now.getTime() + env.settings.reupload_days * 86400_000), mode: "rejected" });
    case "changesRequested":
      return rejectedEmail(env, { ...decision, until: new Date(now.getTime() + env.settings.reupload_days * 86400_000), mode: "changes" });
    case "changeRejected":
      return changeRejectedEmail(env, decision);
    case "refunded":
      return refundedEmail(env, { ...rental, cause: "no_reupload", refundCents: rental.amountCents });
    case "hidden":
      return hiddenEmail(env, decision);
    case "removed":
      return removedEmail(env, decision);
    case "lateRefund":
      return lateRefundEmail(env, rental);
    case "reportReceived":
      return reportReceivedEmail(env, { locale, reference: "R-1A2B3C", no: 1234 });
    case "reportDecided":
      return reportDecidedEmail(env, { locale, reference: "R-1A2B3C", no: 1234, outcome: "actioned" });
    case "transferOffer":
      return transferOfferEmail(env, { ...rental, acceptUrl: url, days: env.settings.transfer_days });
    case "transferDone":
      return transferDoneEmail(env, { ...rental, newOwner: "peter@example.com" });
    case "accountDeleted":
      return accountDeletedEmail(env, { locale });
    case "staffInvite":
      return staffInviteEmail(env, { locale, role: "moderator" });
  }
}
