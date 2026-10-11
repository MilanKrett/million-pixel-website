import { rm } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { activeRental, actor, mails, paidRental, png, rentalRow, resetDatabase, settings } from "./helpers";
import { TEST_STORAGE_DIR } from "./env";

const { closeDb, db } = await import("@/lib/db");
const { approveContent, extendRental, hideRental, rejectContent, removeRental, unhideRental } = await import("@/lib/moderation/decide");
const { submitContentChange } = await import("@/lib/account/changes");
const { saveDraftContent } = await import("@/lib/orders/order");
const { refundMissedReuploads } = await import("@/lib/moderation/jobs");
const { refundRental } = await import("@/lib/payments/refund");
const { createReport, decideReport, REPORT_LIMITS } = await import("@/lib/moderation/reports");
const { runAutoChecks } = await import("@/lib/moderation/checks");
const { notifyChangeRejected } = await import("@/lib/orders/notify");
const { createReservedRental, exportCsv, saveEmailText, saveSettings, setRole } = await import("@/lib/admin/manage");
const { loadEmailEnv } = await import("@/lib/email/env");
const { findOrCreateUser } = await import("@/lib/auth/accounts");
const { loadWallSnapshot } = await import("@/lib/wall/snapshot");

beforeEach(resetDatabase);

afterAll(async () => {
  await closeDb();
  await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});

async function pending(rentalId: string) {
  const [c] = await db()<{ id: string }[]>`select id from content_versions where rental_id = ${rentalId} and status = 'pending' order by created_at desc limit 1`;
  return c?.id ?? null;
}

async function content(id: string) {
  const [c] = await db()<{ status: string; png_path: string | null; title: string | null; reason_code: string | null; blocked_at: Date | null }[]>`
    select status, png_path, title, reason_code, blocked_at from content_versions where id = ${id}
  `;
  return c!;
}

const decision = { reasonCode: "rights" as const, note: "Logo patrí inej firme." };

describe("approving", () => {
  it("starts a new rental on approval", async () => {
    const rental = await paidRental({ x: 0, y: 0, w: 2, h: 2 });
    const result = await approveContent(db(), (await pending(rental.id))!, actor);
    expect(result).toMatchObject({ ok: true, kind: "new" });
    const row = await rentalRow(rental.id);
    expect(row.status).toBe("active");
    expect(row.ends_at!.getFullYear()).toBe(new Date().getFullYear() + 3);
  });

  it("keeps the old content on the wall until a change is approved", async () => {
    const rental = await activeRental({ x: 5, y: 5, w: 2, h: 1 });
    const before = (await rentalRow(rental.id)).active_content_id!;
    // Only the title changes: the new version shares the picture.
    expect(await submitContentChange(db(), rental.id, { contentId: null, title: "Pekáreň u Jany", url: "https://example.com/", displayName: "Jana" }, actor)).toEqual({
      ok: false,
      reason: "unchanged",
    });
    const submitted = await submitContentChange(db(), rental.id, { contentId: null, title: "Nová pekáreň", url: "https://example.com/", displayName: "Jana" }, actor);
    if (!submitted.ok) throw new Error(submitted.reason);
    expect((await content(submitted.contentId)).png_path).toBe((await content(before)).png_path);
    expect((await rentalRow(rental.id)).active_content_id).toBe(before);
    expect((await loadWallSnapshot(db(), await settings())).rentals[0]![5]).toBe("Pekáreň u Jany");

    expect(await approveContent(db(), submitted.contentId, actor)).toMatchObject({ ok: true, kind: "change" });
    expect((await rentalRow(rental.id)).active_content_id).toBe(submitted.contentId);
    expect((await content(before)).status).toBe("superseded");
    expect((await loadWallSnapshot(db(), await settings())).rentals[0]![5]).toBe("Nová pekáreň");
  });

  it("keeps the old content when a change is rejected", async () => {
    const rental = await activeRental({ x: 8, y: 5, w: 1, h: 1 });
    const before = (await rentalRow(rental.id)).active_content_id;
    const draft = await saveDraftContent(db(), rental.id, { kind: "draw", png: await png({ x: 0, y: 0, w: 1, h: 1 }, [0, 0, 0]), params: {} });
    if ("error" in draft) throw new Error();
    const submitted = await submitContentChange(db(), rental.id, { contentId: draft.id, title: "Iná", url: "", displayName: "" }, actor);
    if (!submitted.ok) throw new Error(submitted.reason);
    const result = await rejectContent(db(), await settings(), submitted.contentId, actor, { ...decision, mode: "reject" });
    expect(result).toMatchObject({ ok: true, kind: "change", until: null });
    await notifyChangeRejected(db(), rental.id, submitted.contentId, decision);
    expect(await rentalRow(rental.id)).toMatchObject({ status: "active", active_content_id: before });
    const [mail] = await mails("change_rejected");
    expect(mail!.text_body).toContain("Logo patrí inej firme.");
    expect(mail!.text_body).toContain("Cudzie logá");
  });
});

describe("rejecting new rentals", () => {
  it("waits for new content, then refunds automatically", async () => {
    const rental = await paidRental({ x: 20, y: 0, w: 2, h: 2 });
    const s = await settings();
    const first = await rejectContent(db(), s, (await pending(rental.id))!, actor, { ...decision, mode: "changes" });
    expect(first).toMatchObject({ ok: true, kind: "new", refunded: false });
    let row = await rentalRow(rental.id);
    expect(row.status).toBe("rejected");
    expect(row.cells).toBe(4); // the place stays reserved
    expect(row.reupload_until!.getTime()).toBeGreaterThan(Date.now() + (s.reupload_days - 1) * 86400_000);

    // New content puts the rental back into review.
    const draft = await saveDraftContent(db(), rental.id, { kind: "draw", png: await png({ x: 0, y: 0, w: 2, h: 2 }, [255, 0, 0]), params: {} });
    if ("error" in draft) throw new Error();
    const resubmitted = await submitContentChange(db(), rental.id, { contentId: draft.id, title: "Opravené", url: "", displayName: "" }, actor);
    if (!resubmitted.ok) throw new Error(resubmitted.reason);
    expect((await rentalRow(rental.id)).status).toBe("in_review");

    // Rejected again and nothing new before the deadline: money back, place free.
    await rejectContent(db(), s, resubmitted.contentId, actor, { ...decision, mode: "reject" });
    expect(await refundMissedReuploads(db())).toBe(0);
    await db()`update rentals set reupload_until = now() - interval '1 minute' where id = ${rental.id}`;
    expect(await refundMissedReuploads(db())).toBe(1);
    row = await rentalRow(rental.id);
    expect(row).toMatchObject({ status: "refunded", cells: 0 });
    const [payment] = await db()<{ status: string; refunded_cents: number; amount_cents: number }[]>`select status, refunded_cents, amount_cents from payments where rental_id = ${rental.id}`;
    expect(payment!.status).toBe("refunded");
    expect(payment!.refunded_cents).toBe(payment!.amount_cents);
    expect((await mails("refunded"))[0]!.subject).toBe("Vrátili sme ti platbu");
  });

  it("forgets an old request for changes once new content is approved", async () => {
    const { listMyRentals } = await import("@/lib/account/my-rentals");
    const { findOrCreateUser: user } = await import("@/lib/auth/accounts");
    const jana = await user(db(), "jana@example.com", "sk");
    const rental = await paidRental({ x: 25, y: 20, w: 1, h: 1 });
    await db()`update rentals set user_id = ${jana.id} where id = ${rental.id}`;
    await rejectContent(db(), await settings(), (await pending(rental.id))!, actor, { ...decision, mode: "changes" });
    expect((await listMyRentals(db(), jana.id))[0]!.decision?.status).toBe("changes_requested");
    const resent = await submitContentChange(db(), rental.id, { contentId: null, title: "Opravený názov", url: "", displayName: "" }, actor);
    if (!resent.ok) throw new Error(resent.reason);
    expect((await listMyRentals(db(), jana.id))[0]!.decision).toBeNull();
    await approveContent(db(), resent.contentId, actor);
    const [mine] = await listMyRentals(db(), jana.id);
    expect(mine).toMatchObject({ status: "active", decision: null, declined: null });
    expect(mine!.current?.title).toBe("Opravený názov");
  });

  it("can refund at once", async () => {
    const rental = await paidRental({ x: 30, y: 0, w: 1, h: 1 });
    const result = await rejectContent(db(), await settings(), (await pending(rental.id))!, actor, { ...decision, mode: "reject", refundNow: true });
    expect(result).toMatchObject({ ok: true, refunded: true });
    expect(await rentalRow(rental.id)).toMatchObject({ status: "refunded", cells: 0 });
  });

  it("blocks child-abuse material for good and frees the place", async () => {
    const rental = await paidRental({ x: 40, y: 0, w: 1, h: 1 });
    const contentId = (await pending(rental.id))!;
    const result = await rejectContent(db(), await settings(), contentId, actor, { reasonCode: "child", mode: "reject" });
    expect(result).toMatchObject({ ok: true, blocked: true });
    expect(await rentalRow(rental.id)).toMatchObject({ status: "removed", cells: 0 });
    expect((await content(contentId)).blocked_at).not.toBeNull();
  });

  it("lets only one moderator decide", async () => {
    const rental = await paidRental({ x: 50, y: 0, w: 1, h: 1 });
    const contentId = (await pending(rental.id))!;
    const results = await Promise.all([approveContent(db(), contentId, actor), rejectContent(db(), await settings(), contentId, actor, { ...decision, mode: "reject" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe("actions on running rentals", () => {
  it("hides, shows, extends and removes", async () => {
    const rental = await activeRental({ x: 60, y: 60, w: 2, h: 2 });
    expect(await hideRental(db(), rental.id, actor, decision)).toBe(true);
    expect((await loadWallSnapshot(db(), await settings())).rentals).toHaveLength(0);
    expect(await hideRental(db(), rental.id, actor, decision)).toBe(false);
    expect(await unhideRental(db(), rental.id, actor)).toBe(true);
    expect((await loadWallSnapshot(db(), await settings())).rentals).toHaveLength(1);

    const before = (await rentalRow(rental.id)).ends_at!.getTime();
    const extended = await extendRental(db(), rental.id, actor, 30);
    expect(extended!.getTime() - before).toBe(30 * 86400_000);

    expect(await removeRental(db(), rental.id, actor, decision)).toBe(true);
    expect(await rentalRow(rental.id)).toMatchObject({ status: "removed", cells: 0 });
    const [log] = await db()<{ action: string }[]>`select action from audit_log where action = 'rental.removed'`;
    expect(log).toBeDefined();
  });

  it("refunds a part or all of a payment", async () => {
    const rental = await activeRental({ x: 70, y: 70, w: 5, h: 5 });
    expect(await refundRental(db(), rental.id, { amountCents: 1000, endRental: false, actor, cause: "admin" })).toEqual({ ok: true, refundedCents: 1000 });
    const [p] = await db()<{ status: string; refunded_cents: number }[]>`select status, refunded_cents from payments where rental_id = ${rental.id}`;
    expect(p).toEqual({ status: "partially_refunded", refunded_cents: 1000 });
    expect(await refundRental(db(), rental.id, { amountCents: 99_999_999, endRental: false, actor, cause: "admin" })).toEqual({ ok: false, reason: "invalid_amount" });
    expect(await refundRental(db(), rental.id, { endRental: true, actor, cause: "admin" })).toMatchObject({ ok: true });
    expect(await rentalRow(rental.id)).toMatchObject({ status: "refunded", cells: 0 });
    expect(await refundRental(db(), rental.id, { endRental: false, actor, cause: "admin" })).toEqual({ ok: false, reason: "nothing_to_refund" });
  });
});

describe("reports", () => {
  it("confirms a report, hides while checking, and tells the reporter the decision", async () => {
    const rental = await activeRental({ x: 80, y: 0, w: 1, h: 1 });
    const base = { rentalNo: rental.no, description: "Toto je cudzie logo.", locale: "sk" as const, clientKey: "reporter-1" };
    expect(await createReport(db(), { ...base, category: "nonsense", email: "" })).toEqual({ ok: false, reason: "invalid" });
    expect(await createReport(db(), { ...base, rentalNo: 999_999, category: "rights", email: "" })).toEqual({ ok: false, reason: "rental_not_found" });
    const created = await createReport(db(), { ...base, category: "rights", email: "Reporter@Example.com" });
    if (!created.ok) throw new Error(created.reason);
    expect(created.reference).toMatch(/^R-[0-9A-F]{6}$/);
    expect((await mails("report_received"))[0]).toMatchObject({ to_email: "reporter@example.com" });

    expect(await decideReport(db(), created.id, actor, { decision: "hide", reasonCode: "rights" })).toMatchObject({ ok: true, wallChanged: true });
    expect((await rentalRow(rental.id)).hidden_at).not.toBeNull();
    expect((await mails("hidden"))[0]).toMatchObject({ to_email: "jana@example.com" });

    expect(await decideReport(db(), created.id, actor, { decision: "remove", reasonCode: "rights", note: "Porušenie práv." })).toMatchObject({ ok: true });
    expect((await rentalRow(rental.id)).status).toBe("removed");
    const [report] = await db()<{ status: string; action: string }[]>`select status, action from reports where id = ${created.id}`;
    expect(report).toEqual({ status: "actioned", action: "removed" });
    expect((await mails("report_decided"))[0]!.text_body).toContain("zakročili");
    expect((await mails("removed"))[0]!.text_body).toContain("Porušenie práv.");
    expect(await decideReport(db(), created.id, actor, { decision: "dismiss", reasonCode: "other" })).toEqual({ ok: false, reason: "closed" });
  });

  it("closes a report without a breach and can show the rental again", async () => {
    const rental = await activeRental({ x: 82, y: 0, w: 1, h: 1 });
    const created = await createReport(db(), { rentalNo: rental.no, category: "other", description: "Neviem.", email: "", locale: "en", clientKey: "r2" });
    if (!created.ok) throw new Error(created.reason);
    await decideReport(db(), created.id, actor, { decision: "hide", reasonCode: "other" });
    expect(await decideReport(db(), created.id, actor, { decision: "dismiss", reasonCode: "other", unhide: true })).toMatchObject({ ok: true, wallChanged: true });
    expect((await rentalRow(rental.id)).hidden_at).toBeNull();
  });

  it("limits reports from one connection", async () => {
    const rental = await activeRental({ x: 84, y: 0, w: 1, h: 1 });
    const make = () => createReport(db(), { rentalNo: rental.no, category: "other", description: "x", email: "", locale: "en", clientKey: "spammer" });
    for (let i = 0; i < REPORT_LIMITS.perHour; i++) expect((await make()).ok).toBe(true);
    expect(await make()).toEqual({ ok: false, reason: "rate_limited" });
  });
});

describe("automatic checks", () => {
  it("stores the results with the content", async () => {
    const rental = await paidRental({ x: 90, y: 90, w: 1, h: 1 });
    const contentId = (await pending(rental.id))!;
    await db()`update content_versions set title = 'Kurva drahé', url = null where id = ${contentId}`;
    const checks = await runAutoChecks(db(), contentId);
    expect(checks?.text.flagged).toContain("kurv");
    expect(checks?.link.status).toBe("none");
    expect(checks?.image.status).toBe("skipped");
    const [row] = await db()<{ auto_checks: { text: { flagged: string[] } }; checks_done_at: Date | null }[]>`select auto_checks, checks_done_at from content_versions where id = ${contentId}`;
    expect(row!.checks_done_at).not.toBeNull();
    expect(row!.auto_checks.text.flagged).toContain("kurv");
  });
});

describe("administration", () => {
  it("reserves places without payment", async () => {
    const s = await settings();
    const first = await createReservedRental(db(), s, { rect: { x: 0, y: 50, w: 3, h: 3 }, endsAt: null }, actor);
    expect(first.ok).toBe(true);
    expect(await createReservedRental(db(), s, { rect: { x: 2, y: 52, w: 2, h: 2 }, endsAt: null }, actor)).toMatchObject({ ok: false, reason: "taken" });
    expect(await createReservedRental(db(), s, { rect: { x: 99, y: 0, w: 2, h: 1 }, endsAt: null }, actor)).toEqual({ ok: false, reason: "invalid" });
  });

  it("validates settings and locks the wall size once rentals exist", async () => {
    try {
      expect(await saveSettings(db(), { hold_minutes: 20 }, actor)).toEqual({ ok: true, changed: ["hold_minutes"] });
      expect((await settings()).hold_minutes).toBe(20);
      const bad = await saveSettings(db(), { hold_minutes: 0 }, actor);
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(Object.keys(bad.errors)).toEqual(["hold_minutes"]);
      await activeRental({ x: 1, y: 1, w: 1, h: 1 });
      expect(await saveSettings(db(), { block_size_px: 20 }, actor)).toEqual({ ok: false, errors: { block_size_px: "locked" } });
    } finally {
      await db()`delete from settings where key in ('hold_minutes', 'block_size_px')`;
    }
  });

  it("checks changed e-mail texts before saving them", async () => {
    expect(await saveEmailText(db(), "sk", "paid.subject", "Ďakujeme, {title}", actor)).toMatchObject({ ok: false, reason: "unknown_placeholder" });
    expect(await saveEmailText(db(), "sk", "login.intro", "Platí {minutes, plural, one {# minútu}", actor)).toMatchObject({ ok: false, reason: "syntax" });
    expect(await saveEmailText(db(), "sk", "nope.key", "x", actor)).toMatchObject({ ok: false, reason: "unknown_key" });
    expect(await saveEmailText(db(), "sk", "paid.subject", "Platba prijatá – ďakujeme!", actor)).toEqual({ ok: true });
    expect((await loadEmailEnv(db())).texts?.sk?.["paid.subject"]).toBe("Platba prijatá – ďakujeme!");
    await paidRental({ x: 3, y: 3, w: 1, h: 1 });
    // The changed text is used in the next e-mail.
    const { notifyPaid } = await import("@/lib/orders/notify");
    const [rental] = await db()<{ id: string }[]>`select id from rentals limit 1`;
    await notifyPaid(db(), rental!.id);
    expect((await mails("paid"))[0]!.subject).toBe("Platba prijatá – ďakujeme!");
    expect(await saveEmailText(db(), "sk", "paid.subject", "", actor)).toEqual({ ok: true });
    expect((await loadEmailEnv(db())).texts?.sk?.["paid.subject"]).toBeUndefined();
  });

  it("gives and takes roles, keeping at least one administrator", async () => {
    const boss = await findOrCreateUser(db(), "boss@example.com", "sk");
    expect(await setRole(db(), "mod@example.com", "moderator", { ...actor, id: boss.id })).toEqual({ ok: true });
    expect((await mails("staff_invite"))[0]).toMatchObject({ to_email: "mod@example.com" });
    expect(await setRole(db(), "boss@example.com", "user", { ...actor, id: boss.id })).toEqual({ ok: false, reason: "self" });
    const other = await findOrCreateUser(db(), "other@example.com", "sk");
    expect(await setRole(db(), "boss@example.com", "user", { ...actor, id: other.id })).toEqual({ ok: false, reason: "last_admin" });
  });

  it("exports rentals and payments as CSV", async () => {
    await activeRental({ x: 7, y: 7, w: 1, h: 1 });
    const rentals = await exportCsv(db(), "rentals");
    expect(rentals.split("\r\n")[0]).toContain("no,x_blocks");
    expect(rentals).toContain("Pekáreň u Jany");
    expect(await exportCsv(db(), "payments")).toContain("jana@example.com");
  });
});
