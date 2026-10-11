import { rm } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { activeRental, mails, paidRental, rentalRow, resetDatabase } from "./helpers";
import { TEST_STORAGE_DIR } from "./env";

const { closeDb, db } = await import("@/lib/db");
const { consumeLoginToken, requestLoginLink, LOGIN_LIMITS } = await import("@/lib/auth/login");
const { createSession, deleteSession, findSession } = await import("@/lib/auth/session");
const { findOrCreateUser } = await import("@/lib/auth/accounts");
const { enableTotp, ensurePendingTotp, verifySecondFactor } = await import("@/lib/auth/mfa");
const { timeStep, totpCode } = await import("@/lib/auth/totp");
const { acceptTransfer, cancelTransfer, startTransfer } = await import("@/lib/account/transfer");
const { deleteAccount } = await import("@/lib/account/delete");
const { listMyRentals } = await import("@/lib/account/my-rentals");
const { notifyPaid } = await import("@/lib/orders/notify");

beforeEach(resetDatabase);

afterAll(async () => {
  await closeDb();
  await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});

/** Sign in like a person would: ask for a link, read it from the e-mail, use it. */
async function signIn(email: string, clientKey = "client-1") {
  expect(await requestLoginLink(db(), { email, locale: "sk", next: "/sk/my-pixels", clientKey })).toBe("sent");
  const [mail] = (await mails("login")).filter((m) => m.to_email === email.toLowerCase()).slice(-1);
  const token = mail!.text_body.match(/#([A-Za-z0-9_-]{43})/)![1]!;
  const result = await consumeLoginToken(db(), token);
  if (!result) throw new Error("sign-in failed");
  return { ...result, token };
}

describe("sign-in by e-mail link", () => {
  it("works once and gives the account the rentals ordered with that address", async () => {
    const order = await paidRental({ x: 0, y: 0, w: 2, h: 2 });
    const result = await signIn("Jana@Example.com");
    expect(result.user.email).toBe("jana@example.com");
    expect(result.next).toBe("/sk/my-pixels");
    expect((await rentalRow(order.id)).user_id).toBe(result.user.id);
    // The link works only once.
    expect(await consumeLoginToken(db(), result.token)).toBeNull();
    // The link was sent in the language of the request, to the sign-in page.
    const [mail] = await mails("login");
    expect(mail!.subject).toContain("Tvoj odkaz na prihlásenie");
    expect(mail!.text_body).toContain("/sk/login/confirm#");

    const session = await findSession(db(), result.sessionToken);
    expect(session?.user.id).toBe(result.user.id);
    await deleteSession(db(), result.sessionToken);
    expect(await findSession(db(), result.sessionToken)).toBeNull();
  });

  it("refuses expired links, bad addresses and too many requests", async () => {
    expect(await requestLoginLink(db(), { email: "nope", locale: "en", clientKey: "c" })).toBe("invalid");
    await requestLoginLink(db(), { email: "a@example.com", locale: "en", clientKey: "c" });
    const [mail] = await mails("login");
    const token = mail!.text_body.match(/#([A-Za-z0-9_-]{43})/)![1]!;
    await db()`update login_tokens set expires_at = now() - interval '1 second'`;
    expect(await consumeLoginToken(db(), token)).toBeNull();
    for (let i = 1; i < LOGIN_LIMITS.perEmailHour; i++) await requestLoginLink(db(), { email: "a@example.com", locale: "en", clientKey: "c" });
    expect(await requestLoginLink(db(), { email: "a@example.com", locale: "en", clientKey: "c" })).toBe("rate_limited");
    // Unknown and known addresses get exactly the same answer (nothing to learn from it).
    expect(await requestLoginLink(db(), { email: "nobody@example.com", locale: "en", clientKey: "d" })).toBe("sent");
  });

  it("makes the addresses in ADMIN_EMAILS administrators", async () => {
    expect((await signIn("boss@example.com")).user.role).toBe("admin");
    expect((await signIn("jana@example.com")).user.role).toBe("user");
  });
});

describe("two-factor login", () => {
  it("is set up with a code from the app, accepts each code once and recovery codes once", async () => {
    const user = await findOrCreateUser(db(), "boss@example.com", "sk");
    const first = await findSession(db(), (await createSession(db(), user.id)).token);
    const secret = await ensurePendingTotp(db(), first!.user);
    // Reloading the setup page keeps the same secret (and QR code).
    const reloaded = await findSession(db(), (await createSession(db(), user.id)).token);
    expect(await ensurePendingTotp(db(), reloaded!.user)).toBe(secret);

    expect(await enableTotp(db(), reloaded!, "000000")).toMatchObject({ ok: false, reason: "invalid" });
    const code = totpCode(secret, timeStep());
    const enabled = await enableTotp(db(), reloaded!, code);
    if (!enabled.ok) throw new Error("not enabled");
    expect(enabled.recoveryCodes).toHaveLength(8);
    expect((await findSession(db(), (await createSession(db(), user.id)).token))?.user.totp_enabled_at).not.toBeNull();

    // A new session: the code just used does not work again.
    const tokenB = (await createSession(db(), user.id)).token;
    const sessionB = await findSession(db(), tokenB);
    expect(sessionB?.mfaAt).toBeNull();
    expect(await verifySecondFactor(db(), sessionB!, code)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await verifySecondFactor(db(), sessionB!, enabled.recoveryCodes[0])).toEqual({ ok: true });
    expect((await findSession(db(), tokenB))?.mfaAt).not.toBeNull();

    const sessionC = await findSession(db(), (await createSession(db(), user.id)).token);
    expect(await verifySecondFactor(db(), sessionC!, enabled.recoveryCodes[0])).toMatchObject({ ok: false });
    expect(await verifySecondFactor(db(), sessionC!, enabled.recoveryCodes[1])).toEqual({ ok: true });
  });

  it("stops guessing after ten tries", async () => {
    const user = await findOrCreateUser(db(), "boss@example.com", "sk");
    const session = await findSession(db(), (await createSession(db(), user.id)).token);
    const secret = await ensurePendingTotp(db(), session!.user);
    const withSecret = await findSession(db(), (await createSession(db(), user.id)).token);
    expect(await enableTotp(db(), withSecret!, totpCode(secret, timeStep()))).toMatchObject({ ok: true });
    const fresh = await findSession(db(), (await createSession(db(), user.id)).token);
    let last;
    for (let i = 0; i < 11; i++) last = await verifySecondFactor(db(), fresh!, "111111");
    expect(last).toMatchObject({ ok: false, reason: "rate_limited" });
  });
});

describe("giving a rental away", () => {
  it("changes the owner only when the new owner accepts", async () => {
    const rental = await activeRental({ x: 10, y: 10, w: 2, h: 1 });
    const jana = await signIn("jana@example.com");
    expect(await startTransfer(db(), { rentalId: rental.id, owner: jana.user, toEmail: "jana@example.com", locale: "sk" })).toMatchObject({
      ok: false,
      reason: "same_owner",
    });
    expect(await startTransfer(db(), { rentalId: rental.id, owner: jana.user, toEmail: "Peter@Example.com", locale: "en" })).toEqual({ ok: true });
    expect((await rentalRow(rental.id)).user_id).toBe(jana.user.id);

    const [offer] = await mails("transfer_offer");
    expect(offer!.to_email).toBe("peter@example.com");
    expect(offer!.text_body).not.toContain("jana@example.com");
    const token = offer!.text_body.match(/#([A-Za-z0-9_-]{43})/)![1]!;

    const accepted = await acceptTransfer(db(), token);
    expect(accepted.ok).toBe(true);
    const after = await rentalRow(rental.id);
    expect(after.email).toBe("peter@example.com");
    expect(after.user_id).not.toBe(jana.user.id);
    expect(await acceptTransfer(db(), token)).toEqual({ ok: false, reason: "invalid" });
    const [done] = await mails("transfer_done");
    expect(done).toMatchObject({ to_email: "jana@example.com" });
    // The receipt stays with the person who paid.
    expect(await listMyRentals(db(), jana.user.id, 14)).toEqual([]);
  });

  it("can be cancelled before it is accepted", async () => {
    const rental = await activeRental({ x: 20, y: 10, w: 1, h: 1 });
    const jana = await signIn("jana@example.com");
    await startTransfer(db(), { rentalId: rental.id, owner: jana.user, toEmail: "peter@example.com", locale: "sk" });
    const token = (await mails("transfer_offer"))[0]!.text_body.match(/#([A-Za-z0-9_-]{43})/)![1]!;
    expect(await cancelTransfer(db(), rental.id, jana.user.id)).toBe(true);
    expect(await acceptTransfer(db(), token)).toEqual({ ok: false, reason: "invalid" });
    expect((await rentalRow(rental.id)).user_id).toBe(jana.user.id);
  });
});

describe("My pixels and account deletion", () => {
  it("lists the rentals with statistics and receipts", async () => {
    const rental = await activeRental({ x: 30, y: 30, w: 2, h: 2 });
    await db()`insert into click_stats (rental_id, day, clicks, opens) values (${rental.id}, current_date, 3, 7)`;
    const jana = await signIn("jana@example.com");
    const [mine] = await listMyRentals(db(), jana.user.id, 14);
    expect(mine).toMatchObject({ no: rental.no, status: "active", stats: { clicks: 3, opens: 7 } });
    expect(mine!.current?.title).toBe("Pekáreň u Jany");
    expect(mine!.payments).toHaveLength(1);
    expect(mine!.payments[0]!.invoiceNumber).toMatch(/^\d{4}-\d{6}$/);
  });

  it("deletes the account and personal data but keeps receipts", async () => {
    const rental = await activeRental({ x: 40, y: 40, w: 1, h: 1 });
    await notifyPaid(db(), rental.id);
    const jana = await signIn("jana@example.com");
    expect(await deleteAccount(db(), jana.user.id)).toEqual({ ok: true });
    const row = await rentalRow(rental.id);
    expect(row).toMatchObject({ email: null, user_id: null, status: "active" });
    const [content] = await db()<{ display_name: string | null }[]>`select display_name from content_versions where rental_id = ${rental.id} and status = 'approved'`;
    expect(content!.display_name).toBeNull();
    const [payment] = await db()<{ buyer_email: string | null }[]>`select buyer_email from payments where rental_id = ${rental.id}`;
    expect(payment!.buyer_email).toBe("jana@example.com");
    const templates = (await mails()).map((m) => m.template);
    expect(templates).toContain("paid");
    expect(templates).not.toContain("login");
    expect(templates).toContain("account_deleted");
    expect(await db()`select 1 from users where email = 'jana@example.com'`).toHaveLength(0);
  });

  it("does not delete the last administrator", async () => {
    const boss = await signIn("boss@example.com");
    expect(await deleteAccount(db(), boss.user.id)).toEqual({ ok: false, reason: "last_admin" });
  });
});
