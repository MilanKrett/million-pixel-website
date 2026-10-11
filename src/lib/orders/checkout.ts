import type { Locale } from "@/i18n/config";
import type { Sql } from "@/lib/db";
import { pixelRange } from "@/lib/geometry";
import { paymentProvider } from "@/lib/payments/provider";
import { quote } from "@/lib/pricing";
import type { Settings } from "@/lib/settings/schema";

/**
 * Payment. The price is computed here, on the server, from the size of the
 * place — never taken from the browser. Completing or expiring a payment
 * is idempotent: the provider may report the same event more than once.
 */

export type StartCheckoutResult =
  | { ok: true; url: string; amountCents: number }
  | { ok: false; reason: "not_found" | "expired" | "incomplete" | "sales_paused" | "already_paid" };

export async function startCheckout(
  sql: Sql,
  settings: Settings,
  rentalId: string,
  urls: { success: string; cancel: string },
): Promise<StartCheckoutResult> {
  if (settings.sales_paused) return { ok: false, reason: "sales_paused" };
  const provider = paymentProvider();

  return sql.begin(async (tx) => {
    const [rental] = await tx<
      { id: string; x: number; y: number; w: number; h: number; status: string; stale: boolean; email: string | null; terms_accepted_at: Date | null; withdrawal_waiver_at: Date | null; locale: Locale }[]
    >`
      select id, x, y, w, h, status, rental_hold_is_stale(status, hold_expires_at) as stale, email,
             terms_accepted_at, withdrawal_waiver_at, locale
      from rentals where id = ${rentalId} for update
    `;
    if (!rental) return { ok: false, reason: "not_found" } as const;
    if (rental.status === "in_review" || rental.status === "active") return { ok: false, reason: "already_paid" } as const;
    if (!["hold", "awaiting_payment"].includes(rental.status) || rental.stale) return { ok: false, reason: "expired" } as const;

    const [content] = await tx<{ id: string; title: string | null }[]>`
      select id, title from content_versions
      where rental_id = ${rentalId} and status = 'draft' order by created_at desc limit 1
    `;
    const q = quote(settings, rental.w, rental.h);
    if (!content?.title || !rental.email || !q || !rental.terms_accepted_at || !rental.withdrawal_waiver_at) {
      return { ok: false, reason: "incomplete" } as const;
    }

    // A new attempt replaces an unfinished one.
    const pending = await tx<{ stripe_session_id: string }[]>`
      update payments set status = 'expired' where rental_id = ${rentalId} and status = 'pending'
      returning stripe_session_id
    `;
    for (const p of pending) await provider.expireCheckout(p.stripe_session_id).catch(() => {});

    const [{ expires_at }] = await tx<{ expires_at: Date }[]>`
      update rentals
      set status = 'awaiting_payment', price_cents = ${q.totalCents}, currency = ${q.currency},
          hold_expires_at = greatest(hold_expires_at, now() + make_interval(mins => ${settings.checkout_hold_minutes}))
      where id = ${rentalId}
      returning hold_expires_at as expires_at
    `;
    const range = pixelRange(rental, settings.block_size_px);
    const session = await provider.createCheckout({
      rentalId,
      amountCents: q.totalCents,
      currency: q.currency,
      description: `${rental.w * settings.block_size_px} × ${rental.h * settings.block_size_px} px (x ${range.x0}–${range.x1}, y ${range.y0}–${range.y1}) — ${content.title}`,
      customerEmail: rental.email,
      locale: rental.locale,
      expiresAt: expires_at,
      successUrl: urls.success,
      cancelUrl: urls.cancel,
    });
    await tx`
      insert into payments (rental_id, kind, provider, stripe_session_id, amount_cents, currency, status, expires_at)
      values (${rentalId}, 'new', ${provider.name}, ${session.sessionId}, ${q.totalCents}, ${q.currency}, 'pending', ${expires_at})
    `;
    return { ok: true, url: session.url, amountCents: q.totalCents } as const;
  });
}

/** Why a payment was sent back automatically. */
export type RefundReason = "space_taken" | "amount_mismatch" | "duplicate";

export type CompleteResult =
  | { outcome: "paid"; rentalId: string; invoiceNumber: string }
  | { outcome: "refunded"; rentalId: string; reason: RefundReason }
  | { outcome: "already_processed" | "unknown_session" };

/**
 * The provider confirmed a payment. Normally the order moves to review. If the
 * reservation had already ended, the space is taken again when still free;
 * when someone else got it meanwhile, the whole amount is refunded.
 */
export async function completeCheckout(
  sql: Sql,
  sessionId: string,
  paid: { amountCents: number; paymentRef: string },
): Promise<CompleteResult> {
  const result = await sql.begin(async (tx): Promise<CompleteResult> => {
    const [payment] = await tx<{ id: string; rental_id: string; status: string; amount_cents: number }[]>`
      select id, rental_id, status, amount_cents from payments where stripe_session_id = ${sessionId} for update
    `;
    if (!payment) return { outcome: "unknown_session" };
    if (payment.status !== "pending" && payment.status !== "expired") return { outcome: "already_processed" };

    const [rental] = await tx<{ id: string; x: number; y: number; w: number; h: number; status: string }[]>`
      select id, x, y, w, h, status from rentals where id = ${payment.rental_id} for update
    `;

    const refund = async (reason: RefundReason): Promise<CompleteResult> => {
      await tx`
        update payments
        set status = 'refunded', refunded_cents = ${paid.amountCents}, paid_at = now(), stripe_payment_intent_id = ${paid.paymentRef}
        where id = ${payment.id}
      `;
      if (rental.status === "expired" || rental.status === "hold" || rental.status === "awaiting_payment") {
        await tx`update rentals set status = 'refunded', hold_expires_at = null where id = ${rental.id}`;
      }
      await tx`
        insert into audit_log (action, target, details)
        values ('payment.refunded_automatically', ${`rental:${rental.id}`}, ${tx.json({ reason, sessionId, amount: paid.amountCents })})
      `;
      return { outcome: "refunded", rentalId: rental.id, reason };
    };

    if (paid.amountCents !== payment.amount_cents) return refund("amount_mismatch");

    if (!["hold", "awaiting_payment", "expired"].includes(rental.status)) return refund("duplicate");

    if (rental.status === "expired") {
      // Late payment: take the space again if nobody else has it.
      const inserted = await tx`
        insert into block_cells (bx, by, rental_id)
        select gx, gy, ${rental.id}
        from generate_series(${rental.x}::int, ${rental.x + rental.w - 1}::int) gx
        cross join generate_series(${rental.y}::int, ${rental.y + rental.h - 1}::int) gy
        on conflict (bx, by) do nothing
        returning bx
      `;
      if (inserted.length !== rental.w * rental.h) {
        await tx`delete from block_cells where rental_id = ${rental.id}`;
        return refund("space_taken");
      }
    }

    const [{ invoice }] = await tx<{ invoice: string }[]>`
      select to_char(now() at time zone 'Europe/Bratislava', 'YYYY') || '-' || lpad(nextval('invoice_seq')::text, 6, '0') as invoice
    `;
    await tx`
      update payments
      set status = 'paid', paid_at = now(), invoice_number = ${invoice}, stripe_payment_intent_id = ${paid.paymentRef},
          buyer_email = (select email from rentals where id = ${rental.id})
      where id = ${payment.id}
    `;
    await tx`
      update rentals
      set status = 'in_review', paid_at = now(), hold_expires_at = null, price_cents = ${paid.amountCents}
      where id = ${rental.id}
    `;
    await tx`
      update content_versions set status = 'pending', submitted_at = now()
      where id = (select id from content_versions where rental_id = ${rental.id} and status = 'draft' order by created_at desc limit 1)
    `;
    // A buyer who already has an account sees the rental in My pixels right away.
    await tx`
      update rentals r set user_id = u.id
      from users u
      where r.id = ${rental.id} and r.user_id is null and u.email = lower(r.email)
    `;
    await tx`
      insert into audit_log (action, target, details)
      values ('payment.completed', ${`rental:${rental.id}`}, ${tx.json({ sessionId, amount: paid.amountCents, invoice })})
    `;
    return { outcome: "paid", rentalId: rental.id, invoiceNumber: invoice };
  });

  if (result.outcome === "refunded") {
    const [payment] = await sql<{ stripe_payment_intent_id: string | null }[]>`
      select stripe_payment_intent_id from payments where stripe_session_id = ${sessionId}
    `;
    await paymentProvider().refund(payment?.stripe_payment_intent_id ?? sessionId, paid.amountCents);
  }
  return result;
}

/** The provider reports that a payment session ended without payment. */
export async function expireCheckout(sql: Sql, sessionId: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [payment] = await tx<{ rental_id: string }[]>`
      update payments set status = 'expired'
      where stripe_session_id = ${sessionId} and status = 'pending'
      returning rental_id
    `;
    if (!payment) return false;
    await tx`
      update rentals set status = 'expired'
      where id = ${payment.rental_id} and status = 'awaiting_payment'
        and not exists (select 1 from payments where rental_id = ${payment.rental_id} and status = 'pending')
    `;
    return true;
  });
}
