import { createHmac, timingSafeEqual } from "node:crypto";
import { localePath, type Locale } from "@/i18n/config";
import type { Sql } from "@/lib/db";
import { pixelRange, type Rect } from "@/lib/geometry";
import { paymentProvider } from "@/lib/payments/provider";
import { quote } from "@/lib/pricing";
import type { Settings } from "@/lib/settings/schema";

/**
 * Paid extensions. A rental can be extended at any time while it is active
 * and during the grace period after its end; the new period continues from
 * the current end date. The reminder e-mails carry a signed link, so the
 * renter can pay without signing in ("extend with one click"); the signed-in
 * owner can extend from My pixels. The price is computed here, never taken
 * from the browser.
 */

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (at least 32 characters).");
  return s;
}

/** Key of the one-click link. It only lets someone pay for this rental, so it does not expire. */
export function extensionKey(rentalId: string): string {
  return createHmac("sha256", secret()).update(`extend:${rentalId}`).digest("base64url").slice(0, 32);
}

export function extensionKeyMatches(rentalId: string, key: string | null | undefined): boolean {
  if (!key) return false;
  const expected = Buffer.from(extensionKey(rentalId));
  const given = Buffer.from(key);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** "/de/extend/123?k=…" */
export function extensionPath(locale: Locale, no: number, rentalId: string): string {
  return `${localePath(locale, `/extend/${no}`)}?k=${extensionKey(rentalId)}`;
}

export type ExtensionBlock = "not_extendable" | "hidden" | "reserved" | "sales_paused";

export interface ExtensionOption {
  years: number;
  discountPct: number;
  totalCents: number;
  endsAt: Date;
}

export interface ExtensionState {
  id: string;
  no: number;
  rect: Rect;
  status: string;
  endsAt: Date | null;
  /** End of the grace period (content leaves the wall then). */
  graceEndsAt: Date | null;
  title: string | null;
  userId: string | null;
  email: string | null;
  blocked: ExtensionBlock | null;
  options: ExtensionOption[];
  /** The most recent paid extension, for the "thank you" note after paying. */
  lastPaid: { paidAt: Date; years: number } | null;
}

interface RentalForExtension {
  id: string;
  no: number;
  x: number;
  y: number;
  w: number;
  h: number;
  status: string;
  ends_at: Date | null;
  hidden_at: Date | null;
  is_reserved: boolean;
  email: string | null;
  user_id: string | null;
  locale: Locale;
  title: string | null;
}

function blockOf(settings: Settings, r: Pick<RentalForExtension, "status" | "ends_at" | "hidden_at" | "is_reserved" | "email">): ExtensionBlock | null {
  if (!["active", "grace"].includes(r.status) || !r.ends_at || !r.email) return "not_extendable";
  if (r.is_reserved) return "reserved";
  if (r.hidden_at) return "hidden";
  if (settings.sales_paused) return "sales_paused";
  return null;
}

/** Everything the extension page shows, by the public rental number. */
export async function loadExtension(sql: Sql, settings: Settings, no: number): Promise<ExtensionState | null> {
  if (!Number.isSafeInteger(no) || no <= 0) return null;
  const [r] = await sql<(RentalForExtension & { grace_ends_at: Date | null })[]>`
    select r.id, r.no, r.x, r.y, r.w, r.h, r.status, r.ends_at, r.hidden_at, r.is_reserved, r.email, r.user_id, r.locale,
           r.ends_at + make_interval(days => ${settings.grace_days}) as grace_ends_at,
           (select title from content_versions c where c.id = r.active_content_id) as title
    from rentals r where r.no = ${no}
  `;
  if (!r) return null;
  const blocked = blockOf(settings, r);
  let options: ExtensionOption[] = [];
  if (!blocked && r.ends_at) {
    const priced = settings.periods.map((p) => ({ p, q: quote(settings, r.w, r.h, p.years) })).filter((o) => o.q !== null);
    // The new end dates come from the database: calendar years, like the extension itself.
    const ends = await sql<{ years: number; ends_at: Date }[]>`
      select y as years, ${r.ends_at}::timestamptz + make_interval(years => y) as ends_at
      from unnest(${priced.map((o) => o.p.years)}::int[]) as y
    `;
    options = priced.map(({ p, q }) => ({
      years: p.years,
      discountPct: p.discount_pct,
      totalCents: q!.totalCents,
      endsAt: ends.find((e) => e.years === p.years)!.ends_at,
    }));
  }
  const [last] = await sql<{ paid_at: Date; period_years: number }[]>`
    select paid_at, period_years from payments
    where rental_id = ${r.id} and kind = 'extension' and status = 'paid'
    order by paid_at desc limit 1
  `;
  return {
    id: r.id,
    no: r.no,
    rect: { x: r.x, y: r.y, w: r.w, h: r.h },
    status: r.status,
    endsAt: r.ends_at,
    graceEndsAt: r.grace_ends_at,
    title: r.title,
    userId: r.user_id,
    email: r.email,
    blocked,
    options,
    lastPaid: last ? { paidAt: last.paid_at, years: last.period_years } : null,
  };
}

export type StartExtensionResult =
  | { ok: true; url: string; amountCents: number }
  | { ok: false; reason: "not_found" | "invalid_period" | "consent_required" | ExtensionBlock };

/**
 * Create the payment for an extension and return where to send the payer.
 * A newer attempt replaces an unfinished one.
 */
export async function startExtensionCheckout(
  sql: Sql,
  settings: Settings,
  rentalId: string,
  input: { years: number; terms: boolean; waiver: boolean; locale: Locale },
  urls: { success: string; cancel: string },
): Promise<StartExtensionResult> {
  if (!input.terms || !input.waiver) return { ok: false, reason: "consent_required" };
  const provider = paymentProvider();

  return sql.begin(async (tx) => {
    const [r] = await tx<RentalForExtension[]>`
      select r.id, r.no, r.x, r.y, r.w, r.h, r.status, r.ends_at, r.hidden_at, r.is_reserved, r.email, r.user_id, r.locale,
             (select title from content_versions c where c.id = r.active_content_id) as title
      from rentals r where r.id = ${rentalId} for update
    `;
    if (!r) return { ok: false, reason: "not_found" } as const;
    const blocked = blockOf(settings, r);
    if (blocked) return { ok: false, reason: blocked } as const;
    const q = quote(settings, r.w, r.h, input.years);
    if (!q) return { ok: false, reason: "invalid_period" } as const;

    const pending = await tx<{ stripe_session_id: string }[]>`
      update payments set status = 'expired'
      where rental_id = ${rentalId} and kind = 'extension' and status = 'pending'
      returning stripe_session_id
    `;
    for (const p of pending) await provider.expireCheckout(p.stripe_session_id).catch(() => {});

    const [{ expires_at }] = await tx<{ expires_at: Date }[]>`
      select now() + make_interval(mins => ${settings.checkout_hold_minutes}) as expires_at
    `;
    const range = pixelRange(r, settings.block_size_px);
    const session = await provider.createCheckout({
      rentalId,
      amountCents: q.totalCents,
      currency: q.currency,
      description: `+${q.years} y: #${r.no} ${r.w * settings.block_size_px} × ${r.h * settings.block_size_px} px (x ${range.x0}–${range.x1}, y ${range.y0}–${range.y1}) — ${r.title ?? ""}`,
      customerEmail: r.email!,
      locale: input.locale,
      expiresAt: expires_at,
      successUrl: urls.success,
      cancelUrl: urls.cancel,
    });
    await tx`
      insert into payments (rental_id, kind, period_years, provider, stripe_session_id, amount_cents, currency, status, expires_at,
                            terms_accepted_at, withdrawal_waiver_at)
      values (${rentalId}, 'extension', ${q.years}, ${provider.name}, ${session.sessionId}, ${q.totalCents}, ${q.currency}, 'pending',
              ${expires_at}, now(), now())
    `;
    return { ok: true, url: session.url, amountCents: q.totalCents } as const;
  });
}
