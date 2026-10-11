import type { Sql } from "@/lib/db";
import { paymentProvider } from "./provider";

export interface Actor {
  id: string | null;
  label: string;
}

export type RefundResult = { ok: true; refundedCents: number } | { ok: false; reason: "not_found" | "nothing_to_refund" | "invalid_amount" };

/**
 * Return money for a rental through the payment provider, newest payment
 * first. Without an amount everything still refundable is returned.
 * `endRental` also ends the rental and frees its space (refund before the
 * start, or an admin decision); a partial refund normally keeps it running.
 */
export async function refundRental(
  sql: Sql,
  rentalId: string,
  options: { amountCents?: number | null; endRental: boolean; actor: Actor; cause: string },
): Promise<RefundResult> {
  const provider = paymentProvider();
  return sql.begin(async (tx): Promise<RefundResult> => {
    const [rental] = await tx<{ id: string; status: string }[]>`select id, status from rentals where id = ${rentalId} for update`;
    if (!rental) return { ok: false, reason: "not_found" };
    const payments = await tx<{ id: string; amount_cents: number; refunded_cents: number; ref: string | null }[]>`
      select id, amount_cents, refunded_cents, coalesce(stripe_payment_intent_id, stripe_session_id) as ref
      from payments
      where rental_id = ${rentalId} and status in ('paid', 'partially_refunded')
      order by paid_at desc nulls last
      for update
    `;
    const remaining = payments.reduce((sum, p) => sum + p.amount_cents - p.refunded_cents, 0);
    if (remaining <= 0) return { ok: false, reason: "nothing_to_refund" };
    const amount = options.amountCents ?? remaining;
    if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) return { ok: false, reason: "invalid_amount" };

    let left = amount;
    for (const p of payments) {
      if (left === 0) break;
      const cents = Math.min(left, p.amount_cents - p.refunded_cents);
      if (cents <= 0) continue;
      // If the provider refuses, the transaction rolls back and nothing is recorded.
      if (p.ref) await provider.refund(p.ref, cents);
      await tx`
        update payments
        set refunded_cents = refunded_cents + ${cents},
            status = case when refunded_cents + ${cents} >= amount_cents then 'refunded' else 'partially_refunded' end
        where id = ${p.id}
      `;
      left -= cents;
    }

    if (options.endRental && !["refunded", "removed", "ended", "expired"].includes(rental.status)) {
      await tx`update rentals set status = 'refunded', hold_expires_at = null, reupload_until = null where id = ${rentalId}`;
    }
    await tx`
      insert into audit_log (actor_id, action, target, details)
      values (${options.actor.id}, 'payment.refunded', ${`rental:${rentalId}`},
              ${tx.json({ amount, cause: options.cause, endRental: options.endRental, by: options.actor.label })})
    `;
    return { ok: true, refundedCents: amount };
  });
}
