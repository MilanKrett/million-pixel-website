import type { Locale } from "@/i18n/config";
import type { Sql } from "@/lib/db";
import { loadEmailEnv } from "@/lib/email/env";
import { sendEmail } from "@/lib/email/send";
import {
  approvedEmail,
  changeApprovedEmail,
  changeRejectedEmail,
  hiddenEmail,
  lateRefundEmail,
  orderPaidEmail,
  refundedEmail,
  rejectedEmail,
  removedEmail,
  type BuiltEmail,
  type EmailEnv,
  type ReasonCode,
  type RefundCause,
  type RentalEmailData,
} from "@/lib/email/templates";

/** E-mails about a rental. Failures are logged, never thrown at the caller. */

async function rentalEmailData(sql: Sql, rentalId: string, contentId?: string | null): Promise<RentalEmailData | null> {
  const [row] = await sql<
    { no: number; email: string | null; locale: Locale; x: number; y: number; w: number; h: number; period_years: number | null; title: string | null; ends_at: Date | null; amount: number | null; invoice: string | null; paid_at: Date | null }[]
  >`
    select r.no, r.email, r.locale, r.x, r.y, r.w, r.h, r.period_years, r.ends_at,
           coalesce(
             (select title from content_versions c where c.id = ${contentId ?? null}),
             (select title from content_versions c where c.id = r.active_content_id),
             (select title from content_versions c where c.rental_id = r.id and c.title is not null order by c.created_at desc limit 1)
           ) as title,
           p.amount_cents as amount, p.invoice_number as invoice, p.paid_at
    from rentals r
    left join lateral (
      select amount_cents, invoice_number, paid_at from payments
      where rental_id = r.id and kind = 'new' and status in ('paid', 'refunded', 'partially_refunded')
      order by paid_at desc nulls last limit 1
    ) p on true
    where r.id = ${rentalId}
  `;
  if (!row?.email) return null;
  return {
    locale: row.locale,
    to: row.email,
    no: row.no,
    rect: { x: row.x, y: row.y, w: row.w, h: row.h },
    years: row.period_years ?? 1,
    title: row.title ?? "",
    amountCents: row.amount ?? 0,
    invoiceNumber: row.invoice,
    paidAt: row.paid_at,
    endsAt: row.ends_at,
  };
}

async function notify(
  sql: Sql,
  rentalId: string,
  template: string,
  build: (env: EmailEnv, data: RentalEmailData) => BuiltEmail,
  contentId?: string | null,
): Promise<void> {
  try {
    const [env, data] = await Promise.all([loadEmailEnv(sql), rentalEmailData(sql, rentalId, contentId)]);
    if (!data) return;
    await sendEmail(sql, { to: data.to, template, locale: data.locale, rentalId, ...build(env, data) });
  } catch (error) {
    console.error(`[email] could not send "${template}" for rental ${rentalId}:`, error);
  }
}

interface Decision {
  reasonCode: ReasonCode;
  note?: string | null;
}

export const notifyPaid = (sql: Sql, rentalId: string) => notify(sql, rentalId, "paid", orderPaidEmail);
export const notifyApproved = (sql: Sql, rentalId: string) => notify(sql, rentalId, "approved", approvedEmail);
export const notifyLateRefund = (sql: Sql, rentalId: string) => notify(sql, rentalId, "late_refund", lateRefundEmail);

export const notifyChangeApproved = (sql: Sql, rentalId: string, contentId: string) =>
  notify(sql, rentalId, "change_approved", changeApprovedEmail, contentId);

export const notifyRejected = (sql: Sql, rentalId: string, contentId: string, d: Decision & { until: Date; mode: "rejected" | "changes" }) =>
  notify(sql, rentalId, d.mode === "changes" ? "changes_requested" : "rejected", (env, data) => rejectedEmail(env, { ...data, ...d }), contentId);

export const notifyChangeRejected = (sql: Sql, rentalId: string, contentId: string, d: Decision) =>
  notify(sql, rentalId, "change_rejected", (env, data) => changeRejectedEmail(env, { ...data, ...d }), contentId);

export const notifyRefunded = (sql: Sql, rentalId: string, d: { cause: RefundCause; refundCents: number }) =>
  notify(sql, rentalId, "refunded", (env, data) => refundedEmail(env, { ...data, ...d }));

export const notifyHidden = (sql: Sql, rentalId: string, d: Decision) =>
  notify(sql, rentalId, "hidden", (env, data) => hiddenEmail(env, { ...data, ...d }));

export const notifyRemoved = (sql: Sql, rentalId: string, d: Decision) =>
  notify(sql, rentalId, "removed", (env, data) => removedEmail(env, { ...data, ...d }));
