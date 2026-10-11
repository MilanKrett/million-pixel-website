import { rm } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyTestEnvironment, TEST_DATABASE_URL, TEST_STORAGE_DIR } from "./env";

applyTestEnvironment();
process.env.PAYMENT_PROVIDER = "dev";
process.env.EMAIL_DRIVER = "log";

const { closeDb, db } = await import("@/lib/db");
const { loadSettings } = await import("@/lib/settings/load");
const { createHold, expireStaleOrders, loadOccupancy, releaseHold } = await import("@/lib/orders/holds");
const { saveDraftContent, saveDetails, latestDraft, findOrder } = await import("@/lib/orders/order");
const { startCheckout, completeCheckout, expireCheckout } = await import("@/lib/orders/checkout");
const { approveRental } = await import("@/lib/moderation/decide");
const { hashToken } = await import("@/lib/orders/tokens");
const { notifyApproved, notifyLateRefund, notifyPaid } = await import("@/lib/orders/notify");
const { renderWall } = await import("@/lib/wall/render");
const { Raster } = await import("@/lib/wall/raster");
const { loadWallSnapshot } = await import("@/lib/wall/snapshot");

type Rect = { x: number; y: number; w: number; h: number };
const urls = { success: "http://localhost/buy/thanks", cancel: "http://localhost/buy" };

async function settings() {
  return loadSettings(db());
}

async function hold(rect: Rect, client = "client-a") {
  const result = await createHold(db(), await settings(), { rect, clientHash: client, locale: "sk" });
  if (!result.ok) throw new Error(`hold failed: ${result.reason}`);
  return result;
}

/** A complete order (content + details) ready for payment. */
async function readyOrder(rect: Rect, client = "client-a") {
  const h = await hold(rect, client);
  const png = await Raster.filled(rect.w * 10, rect.h * 10, [10, 200, 30]).encodePng();
  const saved = await saveDraftContent(db(), h.id, { kind: "draw", png, params: {} });
  if ("error" in saved) throw new Error("save failed");
  await saveDetails(
    db(),
    h.id,
    saved.id,
    { title: "Pekáreň u Jany", url: "https://example.com/", displayName: "Jana", email: "jana@example.com", marketing: false },
    "sk",
  );
  return h;
}

/** A new reservation from the browser that holds `previous` ("Change place" / "Reserve again"). */
async function replace(previous: { id: string; token: string }, rect: Rect, s?: Awaited<ReturnType<typeof settings>>) {
  return createHold(db(), s ?? (await settings()), {
    rect,
    clientHash: "client-a",
    locale: "sk",
    replaceId: previous.id,
    replaceTokenHash: hashToken(previous.token),
  });
}

async function pay(rentalId: string) {
  const s = await settings();
  const started = await startCheckout(db(), s, rentalId, urls);
  if (!started.ok) throw new Error(`checkout failed: ${started.reason}`);
  const [payment] = await db()<{ stripe_session_id: string; amount_cents: number }[]>`
    select stripe_session_id, amount_cents from payments where rental_id = ${rentalId} and status = 'pending'
  `;
  return { started, payment };
}

async function status(id: string) {
  const [r] = await db()<{ status: string; cells: number }[]>`
    select status, (select count(*)::int from block_cells where rental_id = ${id}) as cells from rentals where id = ${id}
  `;
  return r;
}

beforeEach(async () => {
  await db()`truncate rentals, wall_versions, wall_dirty, click_stats, email_log, audit_log restart identity cascade`;
  // Receipt numbers are a sequence of their own (not reset by truncate).
  await db()`select setval('invoice_seq', 1, false)`;
});

afterAll(async () => {
  await closeDb();
  await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});

describe("reserving space", () => {
  it("reserves the blocks for the configured time and stores only a token hash", async () => {
    const h = await hold({ x: 10, y: 10, w: 4, h: 2 });
    const [row] = await db()<{ status: string; minutes: number; order_token_hash: string }[]>`
      select status, (extract(epoch from hold_expires_at - now()) / 60)::float8 as minutes, order_token_hash from rentals where id = ${h.id}
    `;
    expect(row.status).toBe("hold");
    expect(row.minutes).toBeGreaterThan(14);
    expect(row.minutes).toBeLessThanOrEqual(15);
    expect(row.order_token_hash).not.toContain(h.token);
    expect((await status(h.id)).cells).toBe(8);
    expect(await findOrder(db(), h.id, h.token)).not.toBeNull();
    expect(await findOrder(db(), h.id, "x".repeat(43))).toBeNull();
  });

  it("refuses taken space and offers the nearest free spots of the same size", async () => {
    await hold({ x: 10, y: 10, w: 4, h: 4 });
    const result = await createHold(db(), await settings(), { rect: { x: 12, y: 12, w: 4, h: 4 }, clientHash: "client-b", locale: "en" });
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "taken") throw new Error("expected taken");
    expect(result.blocks).toContainEqual([12, 12]);
    expect(result.blocks).toHaveLength(4);
    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) {
      expect(s.w).toBe(4);
      expect(s.x < 14 && s.x + 4 > 10 && s.y < 14 && s.y + 4 > 10).toBe(false);
    }
  });

  it("lets only one of many simultaneous orders get the same space", async () => {
    const clients = Array.from({ length: 10 }, () => postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} }));
    const s = await settings();
    try {
      const results = await Promise.all(
        clients.map((c, i) => createHold(c, s, { rect: { x: 50, y: 50, w: 3, h: 3 }, clientHash: `c${i}`, locale: "en" })),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok && r.reason === "taken")).toHaveLength(9);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  it("checks size, the sales switch and the per-visitor limit", async () => {
    const s = await settings();
    const create = (rect: Rect, extra: Partial<typeof s> = {}, client = "client-z") =>
      createHold(db(), { ...s, ...extra }, { rect, clientHash: client, locale: "en" });
    expect(await create({ x: 99, y: 0, w: 2, h: 1 })).toEqual({ ok: false, reason: "invalid" });
    expect(await create({ x: 0, y: 0, w: 1, h: 1 }, { min_blocks: 2 })).toEqual({ ok: false, reason: "too_small" });
    expect(await create({ x: 0, y: 0, w: 3, h: 3 }, { max_blocks: 4 })).toEqual({ ok: false, reason: "too_large" });
    expect(await create({ x: 0, y: 0, w: 1, h: 1 }, { sales_paused: true })).toEqual({ ok: false, reason: "sales_paused" });
    for (let i = 0; i < s.max_active_holds; i++) expect((await create({ x: i * 2, y: 20, w: 1, h: 1 })).ok).toBe(true);
    expect(await create({ x: 30, y: 20, w: 1, h: 1 })).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("treats a reservation past its time as free, even before the cleanup job", async () => {
    const old = await hold({ x: 5, y: 5, w: 2, h: 2 });
    await db()`update rentals set hold_expires_at = now() - interval '1 second' where id = ${old.id}`;
    const grid = await loadOccupancy(db(), await settings());
    expect(grid.occupied[5 * 100 + 5]).toBe(0);
    const snapshot = await loadWallSnapshot(db(), await settings());
    expect(snapshot.holds).toEqual([]);
    const fresh = await hold({ x: 5, y: 5, w: 2, h: 2 }, "client-b");
    expect(fresh.ok).toBe(true);
    expect((await status(old.id)).status).toBe("expired");
  });

  it("frees reservations within a minute through the cleanup job", async () => {
    const h = await hold({ x: 1, y: 1, w: 1, h: 1 });
    expect(await expireStaleOrders(db())).toBe(0);
    await db()`update rentals set hold_expires_at = now() - interval '1 second' where id = ${h.id}`;
    expect(await expireStaleOrders(db())).toBe(1);
    expect(await status(h.id)).toEqual({ status: "expired", cells: 0 });
  });

  it("gives up the previous reservation when the same browser starts again", async () => {
    const first = await hold({ x: 0, y: 0, w: 2, h: 2 });
    const second = await replace(first, { x: 10, y: 0, w: 1, h: 1 });
    expect(second).toMatchObject({ ok: true, carriedContent: false });
    expect((await status(first.id)).status).toBe("expired");
  });

  it("moves the picture and details to a new place of the same size, but asks for consent again", async () => {
    const first = await readyOrder({ x: 0, y: 0, w: 3, h: 2 });
    const firstDraft = await latestDraft(db(), first.id);
    // The new place overlaps the old one: its blocks are freed first.
    const second = await replace(first, { x: 1, y: 1, w: 3, h: 2 });
    expect(second).toMatchObject({ ok: true, carriedContent: true });
    if (!second.ok) throw new Error();
    expect(await status(first.id)).toEqual({ status: "expired", cells: 0 });
    expect((await status(second.id)).cells).toBe(6);

    const draft = await latestDraft(db(), second.id);
    expect(draft).toMatchObject({ kind: "draw", title: "Pekáreň u Jany", url: "https://example.com/", display_name: "Jana" });
    expect(draft?.png_path).toContain(second.id);
    // A copy, so the old order keeps its own file.
    expect(draft?.png_path).not.toBe(firstDraft?.png_path);
    const { storage } = await import("@/lib/storage");
    expect(await storage().get("content", draft!.png_path!)).not.toBeNull();
    expect(await storage().get("content", firstDraft!.png_path!)).not.toBeNull();

    const order = await findOrder(db(), second.id, second.token);
    expect(order).toMatchObject({ email: "jana@example.com", terms_accepted_at: null, withdrawal_waiver_at: null });
    expect(await startCheckout(db(), await settings(), second.id, urls)).toEqual({ ok: false, reason: "incomplete" });
  });

  it("keeps the details but not the picture when the size changes", async () => {
    const first = await readyOrder({ x: 0, y: 0, w: 3, h: 2 });
    const second = await replace(first, { x: 0, y: 0, w: 2, h: 2 });
    expect(second).toMatchObject({ ok: true, carriedContent: false });
    if (!second.ok) throw new Error();
    expect(await latestDraft(db(), second.id)).toBeNull();
    expect(await findOrder(db(), second.id, second.token)).toMatchObject({ email: "jana@example.com" });
  });

  it("carries the picture over when an expired reservation is made again", async () => {
    const first = await readyOrder({ x: 7, y: 7, w: 1, h: 1 });
    await db()`update rentals set hold_expires_at = now() - interval '1 second' where id = ${first.id}`;
    await expireStaleOrders(db());
    const again = await replace(first, { x: 7, y: 7, w: 1, h: 1 });
    expect(again).toMatchObject({ ok: true, carriedContent: true });
  });

  it("keeps the old place when the new one cannot be reserved", async () => {
    const first = await hold({ x: 0, y: 0, w: 1, h: 1 });
    await hold({ x: 5, y: 5, w: 1, h: 1 }, "client-b");
    expect(await replace(first, { x: 5, y: 5, w: 1, h: 1 })).toMatchObject({ ok: false, reason: "taken" });
    expect(await status(first.id)).toEqual({ status: "hold", cells: 1 });

    // Over the limit even without the replaced order: nothing changes either.
    await hold({ x: 20, y: 30, w: 1, h: 1 });
    await hold({ x: 22, y: 30, w: 1, h: 1 });
    const s = await settings();
    expect(await replace(first, { x: 50, y: 50, w: 1, h: 1 }, { ...s, max_active_holds: 2 })).toEqual({ ok: false, reason: "rate_limited" });
    expect(await status(first.id)).toEqual({ status: "hold", cells: 1 });
  });

  it("stops the payment of an order whose place was changed", async () => {
    const first = await readyOrder({ x: 12, y: 12, w: 1, h: 1 });
    const { payment } = await pay(first.id);
    const second = await replace(first, { x: 14, y: 12, w: 1, h: 1 });
    expect(second.ok).toBe(true);
    const [p] = await db()<{ status: string }[]>`select status from payments where stripe_session_id = ${payment.stripe_session_id}`;
    expect(p.status).toBe("expired");
  });

  it("can release a reservation on purpose", async () => {
    const h = await hold({ x: 3, y: 3, w: 1, h: 1 });
    expect(await releaseHold(db(), h.id)).toBe(true);
    expect(await status(h.id)).toEqual({ status: "expired", cells: 0 });
    expect(await releaseHold(db(), h.id)).toBe(false);
  });
});

describe("content drafts", () => {
  it("keeps only the latest draft and carries over the title", async () => {
    const h = await readyOrder({ x: 0, y: 0, w: 1, h: 1 });
    const png = await Raster.filled(10, 10, [0, 0, 0]).encodePng();
    const saved = await saveDraftContent(db(), h.id, { kind: "draw", png, params: {} });
    expect("id" in saved).toBe(true);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int n from content_versions where rental_id = ${h.id}`;
    expect(n).toBe(1);
    expect((await latestDraft(db(), h.id))?.title).toBe("Pekáreň u Jany");
  });
});

describe("payment", () => {
  it("needs content and details before payment", async () => {
    const h = await hold({ x: 0, y: 0, w: 1, h: 1 });
    expect(await startCheckout(db(), await settings(), h.id, urls)).toEqual({ ok: false, reason: "incomplete" });
  });

  it("charges the server's price, extends the reservation and moves a paid order to review", async () => {
    const h = await readyOrder({ x: 20, y: 20, w: 5, h: 5 });
    const { started, payment } = await pay(h.id);
    // 50 × 50 px = 2 500 pixels × 0,10 € = 250 €, once.
    expect(started).toMatchObject({ ok: true, amountCents: 25_000 });
    expect(started.ok && started.url).toMatch(/^\/sk\/dev\/checkout\/dev_/);
    const [r] = await db()<{ status: string; minutes: number }[]>`
      select status, (extract(epoch from hold_expires_at - now()) / 60)::float8 as minutes from rentals where id = ${h.id}
    `;
    expect(r.status).toBe("awaiting_payment");
    expect(r.minutes).toBeGreaterThan(29);

    const result = await completeCheckout(db(), payment.stripe_session_id, { amountCents: 25_000, paymentRef: "pi_1" });
    expect(result.outcome).toBe("paid");
    if (result.outcome === "paid") expect(result.invoiceNumber).toMatch(/^\d{4}-000001$/);
    expect(await status(h.id)).toEqual({ status: "in_review", cells: 25 });
    const [content] = await db()<{ status: string }[]>`select status from content_versions where rental_id = ${h.id}`;
    expect(content.status).toBe("pending");

    // The provider may send the same confirmation twice.
    expect((await completeCheckout(db(), payment.stripe_session_id, { amountCents: 25_000, paymentRef: "pi_1" })).outcome).toBe("already_processed");
    expect((await completeCheckout(db(), "dev_unknown", { amountCents: 1, paymentRef: "x" })).outcome).toBe("unknown_session");
  });

  it("refunds a payment that does not match the price", async () => {
    const h = await readyOrder({ x: 0, y: 0, w: 1, h: 1 });
    const { payment } = await pay(h.id);
    const result = await completeCheckout(db(), payment.stripe_session_id, { amountCents: 1, paymentRef: "pi_x" });
    expect(result).toMatchObject({ outcome: "refunded", reason: "amount_mismatch" });
    expect(await status(h.id)).toEqual({ status: "refunded", cells: 0 });
  });

  it("accepts a late payment when the space is still free", async () => {
    const h = await readyOrder({ x: 30, y: 30, w: 2, h: 2 });
    const { payment } = await pay(h.id);
    await db()`update rentals set hold_expires_at = now() - interval '10 minutes' where id = ${h.id}`;
    await expireStaleOrders(db());
    expect(await status(h.id)).toEqual({ status: "expired", cells: 0 });
    const result = await completeCheckout(db(), payment.stripe_session_id, { amountCents: payment.amount_cents, paymentRef: "pi_late" });
    expect(result.outcome).toBe("paid");
    expect(await status(h.id)).toEqual({ status: "in_review", cells: 4 });
  });

  it("refunds a late payment when someone else took the space meanwhile", async () => {
    const h = await readyOrder({ x: 40, y: 40, w: 2, h: 2 });
    const { payment } = await pay(h.id);
    await db()`update rentals set hold_expires_at = now() - interval '10 minutes' where id = ${h.id}`;
    const other = await hold({ x: 41, y: 41, w: 1, h: 1 }, "client-b");
    expect(other.ok).toBe(true);
    const result = await completeCheckout(db(), payment.stripe_session_id, { amountCents: payment.amount_cents, paymentRef: "pi_late" });
    expect(result).toMatchObject({ outcome: "refunded", reason: "space_taken" });
    expect(await status(h.id)).toEqual({ status: "refunded", cells: 0 });
    expect((await status(other.id)).cells).toBe(1);
    const [p] = await db()<{ status: string; refunded_cents: number }[]>`select status, refunded_cents from payments where id is not null and rental_id = ${h.id}`;
    expect(p).toEqual({ status: "refunded", refunded_cents: payment.amount_cents });

    await notifyLateRefund(db(), h.id);
    const [mail] = await db()<{ template: string; to_email: string; subject: string }[]>`select template, to_email, subject from email_log`;
    expect(mail).toEqual({ template: "late_refund", to_email: "jana@example.com", subject: "Prepáč — platbu sme ti vrátili" });
  });

  it("frees the space when the payment session expires", async () => {
    const h = await readyOrder({ x: 60, y: 60, w: 1, h: 1 });
    const { payment } = await pay(h.id);
    expect(await expireCheckout(db(), payment.stripe_session_id)).toBe(true);
    expect(await status(h.id)).toEqual({ status: "expired", cells: 0 });
    expect(await expireCheckout(db(), payment.stripe_session_id)).toBe(false);
  });

  it("replaces an unfinished payment with a new one", async () => {
    const h = await readyOrder({ x: 70, y: 70, w: 1, h: 1 });
    const first = await pay(h.id);
    const second = await pay(h.id);
    expect(second.payment.stripe_session_id).not.toBe(first.payment.stripe_session_id);
    const rows = await db()<{ status: string }[]>`select status from payments where rental_id = ${h.id} order by created_at`;
    expect(rows.map((r) => r.status)).toEqual(["expired", "pending"]);
  });
});

describe("approval and e-mails", () => {
  it("puts the place on the wall for good on approval and sends the e-mails", async () => {
    const h = await readyOrder({ x: 80, y: 80, w: 2, h: 1 });
    const { payment } = await pay(h.id);
    await completeCheckout(db(), payment.stripe_session_id, { amountCents: payment.amount_cents, paymentRef: "pi_ok" });
    await notifyPaid(db(), h.id);

    expect(await approveRental(db(), "00000000-0000-0000-0000-000000000000", { id: null, label: "test" })).toEqual({ ok: false, reason: "not_found" });
    const approved = await approveRental(db(), h.id, { id: null, label: "test" });
    expect(approved.ok).toBe(true);
    const [r] = await db()<{ status: string; started: boolean; ends_at: Date | null }[]>`
      select status, starts_at > now() - interval '1 minute' as started, ends_at from rentals where id = ${h.id}
    `;
    // Bought pixels have no end date.
    expect(r).toEqual({ status: "active", started: true, ends_at: null });
    expect((await approveRental(db(), h.id, { id: null, label: "test" })).ok).toBe(false);

    const rendered = await renderWall(db());
    expect(rendered).not.toBeNull();
    const snapshot = await loadWallSnapshot(db(), await settings());
    expect(snapshot.rentals.map((x) => x[5])).toEqual(["Pekáreň u Jany"]);

    await notifyApproved(db(), h.id);
    const mails = await db()<{ template: string; locale: string; html: string; text_body: string }[]>`
      select template, locale, html, text_body from email_log order by id
    `;
    expect(mails.map((m) => m.template)).toEqual(["paid", "approved"]);
    expect(mails[0].locale).toBe("sk");
    expect(mails[0].text_body).toContain("Doklad");
    // 20 × 10 px = 200 pixels × 0,10 € = 20 €.
    expect(mails[0].text_body).toContain("20 €".replace(" ", " "));
    expect(mails[0].html).toContain("Pekáreň u Jany");
    expect(mails[1].text_body).toContain("?x=80&y=80&zoom=4");
  });

  it("escapes user text in e-mails", async () => {
    const h = await hold({ x: 90, y: 90, w: 1, h: 1 });
    const png = await Raster.filled(10, 10, [0, 0, 0]).encodePng();
    const saved = await saveDraftContent(db(), h.id, { kind: "draw", png, params: {} });
    if ("error" in saved) throw new Error();
    await saveDetails(db(), h.id, saved.id, { title: "<script>alert(1)</script>", url: null, displayName: null, email: "x@example.com", marketing: false }, "en");
    const { payment } = await pay(h.id);
    await completeCheckout(db(), payment.stripe_session_id, { amountCents: payment.amount_cents, paymentRef: "pi" });
    await notifyPaid(db(), h.id);
    const [mail] = await db()<{ html: string }[]>`select html from email_log`;
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
