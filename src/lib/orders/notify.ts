import type { Sql } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { approvedEmail, lateRefundEmail, orderPaidEmail, type RentalEmailData } from "@/lib/email/templates";
import { loadSettings } from "@/lib/settings/load";

/** E-mails sent after order events. Failures are logged, never thrown at the buyer. */

async function rentalEmailData(sql: Sql, rentalId: string): Promise<RentalEmailData | null> {
  const [row] = await sql<
    { email: string | null; locale: "en" | "sk"; x: number; y: number; w: number; h: number; period_years: number | null; title: string | null; ends_at: Date | null; amount: number | null; invoice: string | null; paid_at: Date | null }[]
  >`
    select r.email, r.locale, r.x, r.y, r.w, r.h, r.period_years, r.ends_at,
           (select title from content_versions c where c.rental_id = r.id and c.title is not null order by c.created_at desc limit 1) as title,
           p.amount_cents as amount, p.invoice_number as invoice, p.paid_at
    from rentals r
    left join lateral (
      select amount_cents, invoice_number, paid_at from payments
      where rental_id = r.id and status in ('paid', 'refunded') order by paid_at desc nulls last limit 1
    ) p on true
    where r.id = ${rentalId}
  `;
  if (!row?.email) return null;
  return {
    locale: row.locale,
    to: row.email,
    rect: { x: row.x, y: row.y, w: row.w, h: row.h },
    years: row.period_years ?? 1,
    title: row.title ?? "",
    amountCents: row.amount ?? 0,
    invoiceNumber: row.invoice,
    paidAt: row.paid_at,
    endsAt: row.ends_at,
  };
}

async function notify(sql: Sql, rentalId: string, template: "paid" | "approved" | "late_refund") {
  try {
    const [settings, data] = await Promise.all([loadSettings(sql), rentalEmailData(sql, rentalId)]);
    if (!data) return;
    const built =
      template === "paid" ? orderPaidEmail(settings, data) : template === "approved" ? approvedEmail(settings, data) : lateRefundEmail(settings, data);
    await sendEmail(sql, { to: data.to, template, locale: data.locale, rentalId, ...built });
  } catch (error) {
    console.error(`[email] could not send "${template}" for rental ${rentalId}:`, error);
  }
}

export const notifyPaid = (sql: Sql, rentalId: string) => notify(sql, rentalId, "paid");
export const notifyApproved = (sql: Sql, rentalId: string) => notify(sql, rentalId, "approved");
export const notifyLateRefund = (sql: Sql, rentalId: string) => notify(sql, rentalId, "late_refund");
