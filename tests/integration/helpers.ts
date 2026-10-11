import { applyTestEnvironment } from "./env";

/**
 * Shared steps for database tests: a reserved place, a complete order, a paid
 * and an approved rental. Import this module first: it points the app code
 * at the test database before anything connects.
 */
applyTestEnvironment();

const { db } = await import("@/lib/db");
const { loadSettings } = await import("@/lib/settings/load");
const { createHold } = await import("@/lib/orders/holds");
const { saveDraftContent, saveDetails } = await import("@/lib/orders/order");
const { startCheckout, completeCheckout } = await import("@/lib/orders/checkout");
const { approveRental } = await import("@/lib/moderation/decide");
const { Raster } = await import("@/lib/wall/raster");

export type Rect = { x: number; y: number; w: number; h: number };
export const actor = { id: null, label: "test" };

export async function settings() {
  return loadSettings(db());
}

export async function hold(rect: Rect, client = "client-a") {
  const result = await createHold(db(), await settings(), { rect, clientHash: client, locale: "sk" });
  if (!result.ok) throw new Error(`hold failed: ${result.reason}`);
  return result;
}

export async function png(rect: Rect, rgb: [number, number, number] = [10, 200, 30]) {
  return Raster.filled(rect.w * 10, rect.h * 10, rgb).encodePng();
}

/** Content and details filled in, ready for payment. */
export async function readyOrder(rect: Rect, email = "jana@example.com", client = "client-a") {
  const h = await hold(rect, client);
  const saved = await saveDraftContent(db(), h.id, { kind: "draw", png: await png(rect), params: {} });
  if ("error" in saved) throw new Error("save failed");
  await saveDetails(db(), h.id, saved.id, { title: "Pekáreň u Jany", url: "https://example.com/", displayName: "Jana", email, marketing: false }, "sk");
  return h;
}

/** Paid and waiting for approval. */
export async function paidRental(rect: Rect, email = "jana@example.com", client = "client-a") {
  const h = await readyOrder(rect, email, client);
  const started = await startCheckout(db(), await settings(), h.id, { success: "http://localhost/t", cancel: "http://localhost/c" });
  if (!started.ok) throw new Error(`checkout failed: ${started.reason}`);
  const [payment] = await db()<{ stripe_session_id: string }[]>`select stripe_session_id from payments where rental_id = ${h.id} and status = 'pending'`;
  const result = await completeCheckout(db(), payment!.stripe_session_id, { amountCents: started.amountCents, paymentRef: `pi_${h.id.slice(0, 8)}` });
  if (result.outcome !== "paid") throw new Error(`payment failed: ${result.outcome}`);
  return h;
}

/** Paid and approved: on the wall. */
export async function activeRental(rect: Rect, email = "jana@example.com", client = "client-a") {
  const h = await paidRental(rect, email, client);
  const approved = await approveRental(db(), h.id, actor);
  if (!approved.ok) throw new Error(`approval failed: ${approved.reason}`);
  return h;
}

export async function rentalRow(id: string) {
  const [r] = await db()<
    { status: string; cells: number; user_id: string | null; email: string | null; active_content_id: string | null; hidden_at: Date | null; reupload_until: Date | null; ends_at: Date | null }[]
  >`
    select status, (select count(*)::int from block_cells where rental_id = ${id}) as cells, user_id, email, active_content_id, hidden_at, reupload_until, ends_at
    from rentals where id = ${id}
  `;
  return r!;
}

export async function mails(template?: string) {
  return db()<{ template: string; to_email: string; subject: string; text_body: string }[]>`
    select template, to_email, subject, text_body from email_log
    where ${template ?? null}::text is null or template = ${template ?? null}
    order by id
  `;
}

export async function resetDatabase() {
  await db()`
    truncate rentals, users, sessions, login_tokens, rate_limits, wall_versions, wall_dirty, click_stats, email_log, audit_log,
             reports, email_texts, rental_transfers
    restart identity cascade
  `;
  await db()`select setval('invoice_seq', 1, false)`;
}
