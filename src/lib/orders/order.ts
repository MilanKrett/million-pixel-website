import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import type { Rect } from "@/lib/geometry";
import type { Settings } from "@/lib/settings/schema";
import { storage } from "@/lib/storage";
import { normalizeUrl } from "@/lib/url";
import { tokenMatches } from "./tokens";

/** An order as the browser sees it while renting (steps 2–5). */
export interface OrderState {
  id: string;
  no: number;
  rect: Rect;
  status: string;
  holdExpiresAt: string | null;
  locale: "en" | "sk";
  email: string | null;
  periodYears: number | null;
  termsAccepted: boolean;
  waiver: boolean;
  marketing: boolean;
  content: {
    id: string;
    kind: string;
    params: Record<string, unknown>;
    title: string | null;
    url: string | null;
    displayName: string | null;
  } | null;
}

interface RentalRow {
  id: string;
  no: number;
  x: number;
  y: number;
  w: number;
  h: number;
  status: string;
  hold_expires_at: Date | null;
  order_token_hash: string | null;
  locale: "en" | "sk";
  email: string | null;
  period_years: number | null;
  terms_accepted_at: Date | null;
  withdrawal_waiver_at: Date | null;
  marketing_consent: boolean;
  stale: boolean;
}

/** The rental behind an order cookie, or null if the token does not match. */
export async function findOrder(sql: Sql, id: string, token: string): Promise<RentalRow | null> {
  const [row] = await sql<RentalRow[]>`
    select id, no, x, y, w, h, status, hold_expires_at, order_token_hash, locale, email, period_years,
           terms_accepted_at, withdrawal_waiver_at, marketing_consent,
           rental_hold_is_stale(status, hold_expires_at) as stale
    from rentals where id = ${id}
  `;
  if (!row || !tokenMatches(token, row.order_token_hash)) return null;
  return row;
}

export async function latestDraft(sql: Sql, rentalId: string) {
  const [content] = await sql<
    { id: string; kind: string; params: Record<string, unknown>; title: string | null; url: string | null; display_name: string | null; png_path: string | null; source_path: string | null }[]
  >`
    select id, kind, params, title, url, display_name, png_path, source_path
    from content_versions
    where rental_id = ${rentalId} and status in ('draft', 'pending')
    order by created_at desc
    limit 1
  `;
  return content ?? null;
}

export async function orderState(sql: Sql, rental: RentalRow): Promise<OrderState> {
  const content = await latestDraft(sql, rental.id);
  // A reservation past its time is reported as expired even before the cleanup job runs.
  const status = rental.stale ? "expired" : rental.status;
  return {
    id: rental.id,
    no: rental.no,
    rect: { x: rental.x, y: rental.y, w: rental.w, h: rental.h },
    status,
    holdExpiresAt: rental.hold_expires_at ? rental.hold_expires_at.toISOString() : null,
    locale: rental.locale,
    email: rental.email,
    periodYears: rental.period_years,
    termsAccepted: rental.terms_accepted_at !== null,
    waiver: rental.withdrawal_waiver_at !== null,
    marketing: rental.marketing_consent,
    content: content
      ? { id: content.id, kind: content.kind, params: content.params, title: content.title, url: content.url, displayName: content.display_name }
      : null,
  };
}

/** True while the buyer can still change the order (reserved and not yet paid). */
export function isEditable(rental: RentalRow): boolean {
  return (rental.status === "hold" || rental.status === "awaiting_payment") && !rental.stale;
}

const MAX_VERSIONS_PER_ORDER = 60;

/**
 * Store new content for an order (as a draft). Older drafts and their files
 * are removed; the title, link and name already entered are kept.
 */
export async function saveDraftContent(
  sql: Sql,
  rentalId: string,
  input: { kind: "upload" | "draw" | "text"; png: Buffer; source?: { data: Buffer; ext: string; contentType: string }; params: Record<string, unknown> },
): Promise<{ id: string } | { error: "too_many" }> {
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from content_versions where rental_id = ${rentalId}`;
  if (count >= MAX_VERSIONS_PER_ORDER) return { error: "too_many" };

  const id = randomUUID();
  const pngPath = `rentals/${rentalId}/${id}.png`;
  const sourcePath = input.source ? `rentals/${rentalId}/${id}-source.${input.source.ext}` : null;
  await storage().put("content", pngPath, input.png, { contentType: "image/png" });
  if (input.source && sourcePath) await storage().put("content", sourcePath, input.source.data, { contentType: input.source.contentType });

  const previous = await latestDraft(sql, rentalId);
  const old = await sql.begin(async (tx) => {
    await tx`
      insert into content_versions (id, rental_id, kind, source_path, png_path, title, url, display_name, status, params)
      values (${id}, ${rentalId}, ${input.kind}, ${sourcePath}, ${pngPath},
              ${previous?.title ?? null}, ${previous?.url ?? null}, ${previous?.display_name ?? null}, 'draft', ${tx.json(input.params as never)})
    `;
    return tx<{ png_path: string | null; source_path: string | null }[]>`
      delete from content_versions where rental_id = ${rentalId} and status = 'draft' and id <> ${id}
      returning png_path, source_path
    `;
  });
  const files = old.flatMap((o) => [o.png_path, o.source_path]).filter((p): p is string => Boolean(p));
  if (files.length) await storage().remove("content", files).catch(() => {});
  return { id };
}

export interface DetailsInput {
  title: unknown;
  url: unknown;
  displayName: unknown;
  email: unknown;
  years: unknown;
  terms: unknown;
  waiver: unknown;
  marketing: unknown;
}

export interface Details {
  title: string;
  url: string | null;
  displayName: string | null;
  email: string;
  years: number;
  marketing: boolean;
}

export type DetailsErrors = Partial<Record<"title" | "url" | "displayName" | "email" | "years" | "terms" | "waiver", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate step 4. Error values are translation keys (namespace "rent.errors"). */
export function validateDetails(input: DetailsInput, settings: Settings): { ok: true; details: Details } | { ok: false; errors: DetailsErrors } {
  const errors: DetailsErrors = {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
  const title = str(input.title);
  if (!title) errors.title = "titleRequired";
  else if ([...title].length > 80) errors.title = "titleTooLong";

  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  const url = rawUrl ? normalizeUrl(rawUrl) : null;
  if (rawUrl && !url) errors.url = "urlInvalid";

  const displayName = str(input.displayName);
  if ([...displayName].length > 60) errors.displayName = "nameTooLong";

  const email = (typeof input.email === "string" ? input.email.trim() : "").toLowerCase();
  if (!email) errors.email = "emailRequired";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "emailInvalid";

  const years = Number(input.years);
  if (!settings.periods.some((p) => p.years === years)) errors.years = "periodRequired";
  if (input.terms !== true) errors.terms = "termsRequired";
  if (input.waiver !== true) errors.waiver = "waiverRequired";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, details: { title, url, displayName: displayName || null, email, years, marketing: input.marketing === true } };
}

export async function saveDetails(sql: Sql, rentalId: string, contentId: string, details: Details, locale: "en" | "sk"): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      update content_versions
      set title = ${details.title}, url = ${details.url}, display_name = ${details.displayName}
      where id = ${contentId} and rental_id = ${rentalId} and status = 'draft'
    `;
    await tx`
      update rentals
      set email = ${details.email}, period_years = ${details.years}, locale = ${locale},
          terms_accepted_at = coalesce(terms_accepted_at, now()),
          withdrawal_waiver_at = coalesce(withdrawal_waiver_at, now()),
          marketing_consent = ${details.marketing}
      where id = ${rentalId}
    `;
  });
}
