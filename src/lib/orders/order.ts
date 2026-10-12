import { randomUUID } from "node:crypto";
import type { Locale } from "@/i18n/config";
import type { Sql } from "@/lib/db";
import type { Rect } from "@/lib/geometry";
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
  locale: Locale;
  email: string | null;
  termsAccepted: boolean;
  waiver: boolean;
  marketing: boolean;
  content: {
    id: string;
    kind: string;
    /** "draft" (not sent yet) or "pending" (waiting for review). */
    status: string;
    params: Record<string, unknown>;
    title: string | null;
    url: string | null;
    displayName: string | null;
  } | null;
}

export interface RentalRow {
  id: string;
  no: number;
  x: number;
  y: number;
  w: number;
  h: number;
  status: string;
  hold_expires_at: Date | null;
  order_token_hash: string | null;
  locale: Locale;
  email: string | null;
  user_id: string | null;
  terms_accepted_at: Date | null;
  withdrawal_waiver_at: Date | null;
  marketing_consent: boolean;
  reupload_until: Date | null;
  stale: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A rental by id, without any permission check (callers check ownership). */
export async function loadRental(sql: Sql, id: string): Promise<RentalRow | null> {
  if (!UUID.test(id)) return null;
  const [row] = await sql<RentalRow[]>`
    select id, no, x, y, w, h, status, hold_expires_at, order_token_hash, locale, email, user_id,
           terms_accepted_at, withdrawal_waiver_at, marketing_consent, reupload_until,
           rental_hold_is_stale(status, hold_expires_at) as stale
    from rentals where id = ${id}
  `;
  return row ?? null;
}

/** The rental behind an order cookie, or null if the token does not match. */
export async function findOrder(sql: Sql, id: string, token: string): Promise<RentalRow | null> {
  const row = await loadRental(sql, id);
  if (!row || !tokenMatches(token, row.order_token_hash)) return null;
  return row;
}

/**
 * A paid rental whose owner may change the content (a change goes to review
 * and the current content stays until it is approved). A rejected new rental
 * accepts new content until its deadline.
 */
export function isOwnerEditable(rental: Pick<RentalRow, "status" | "reupload_until">, now = Date.now()): boolean {
  if (rental.status === "rejected") return rental.reupload_until !== null && rental.reupload_until.getTime() > now;
  return rental.status === "in_review" || rental.status === "active" || rental.status === "grace";
}

export async function latestDraft(sql: Sql, rentalId: string) {
  const [content] = await sql<
    { id: string; kind: string; status: string; params: Record<string, unknown>; title: string | null; url: string | null; display_name: string | null; png_path: string | null; source_path: string | null }[]
  >`
    select id, kind, status, params, title, url, display_name, png_path, source_path
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
    termsAccepted: rental.terms_accepted_at !== null,
    waiver: rental.withdrawal_waiver_at !== null,
    marketing: rental.marketing_consent,
    content: content
      ? { id: content.id, kind: content.kind, status: content.status, params: content.params, title: content.title, url: content.url, displayName: content.display_name }
      : null,
  };
}

/** True while the buyer can still change the order (reserved and not yet paid). */
export function isEditable(rental: RentalRow): boolean {
  return (rental.status === "hold" || rental.status === "awaiting_payment") && !rental.stale;
}

/** Limit on saved versions per rental and day (stops filling the storage). */
const MAX_VERSIONS_PER_DAY = 60;

/**
 * Store new content for an order (as a draft). Older drafts and their files
 * are removed; the title, link and name already entered are kept.
 */
export async function saveDraftContent(
  sql: Sql,
  rentalId: string,
  input: { kind: "upload" | "draw" | "text" | "admin"; png: Buffer; source?: { data: Buffer; ext: string; contentType: string }; params: Record<string, unknown> },
): Promise<{ id: string } | { error: "too_many" }> {
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from content_versions
    where rental_id = ${rentalId} and created_at > now() - interval '1 day'
  `;
  if (count >= MAX_VERSIONS_PER_DAY) return { error: "too_many" };

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
  await removeUnusedFiles(sql, old.flatMap((o) => [o.png_path, o.source_path]));
  return { id };
}

/** Delete files no content version refers to any more (a text-only change shares the picture). */
export async function removeUnusedFiles(sql: Sql, paths: (string | null)[]): Promise<void> {
  const candidates = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!candidates.length) return;
  const used = await sql<{ path: string }[]>`
    select png_path as path from content_versions where png_path in ${sql(candidates)}
    union select source_path from content_versions where source_path in ${sql(candidates)}
  `;
  const keep = new Set(used.map((u) => u.path));
  const files = candidates.filter((p) => !keep.has(p));
  if (files.length) await storage().remove("content", files).catch(() => {});
}

export interface DetailsInput {
  title: unknown;
  url: unknown;
  displayName: unknown;
  email: unknown;
  terms: unknown;
  waiver: unknown;
  marketing: unknown;
}

export interface Details {
  title: string;
  url: string | null;
  displayName: string | null;
  email: string;
  marketing: boolean;
}

export type DetailsErrors = Partial<Record<"title" | "url" | "displayName" | "email" | "terms" | "waiver", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContentTexts {
  title: string;
  url: string | null;
  displayName: string | null;
}

/** Title (required, max 80), link (http/https only) and public name (max 60). */
export function validateTexts(
  input: Pick<DetailsInput, "title" | "url" | "displayName">,
): { ok: true; texts: ContentTexts } | { ok: false; errors: Pick<DetailsErrors, "title" | "url" | "displayName"> } {
  const errors: Pick<DetailsErrors, "title" | "url" | "displayName"> = {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
  const title = str(input.title);
  if (!title) errors.title = "titleRequired";
  else if ([...title].length > 80) errors.title = "titleTooLong";

  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  const url = rawUrl ? normalizeUrl(rawUrl) : null;
  if (rawUrl && !url) errors.url = "urlInvalid";

  const displayName = str(input.displayName);
  if ([...displayName].length > 60) errors.displayName = "nameTooLong";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, texts: { title, url, displayName: displayName || null } };
}

/** Validate step 4. Error values are translation keys (namespace "rent.detailErrors"). */
export function validateDetails(input: DetailsInput): { ok: true; details: Details } | { ok: false; errors: DetailsErrors } {
  const texts = validateTexts(input);
  const errors: DetailsErrors = texts.ok ? {} : { ...texts.errors };
  const { title, url, displayName } = texts.ok ? texts.texts : { title: "", url: null, displayName: null };

  const email = (typeof input.email === "string" ? input.email.trim() : "").toLowerCase();
  if (!email) errors.email = "emailRequired";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "emailInvalid";

  if (input.terms !== true) errors.terms = "termsRequired";
  if (input.waiver !== true) errors.waiver = "waiverRequired";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, details: { title, url, displayName, email, marketing: input.marketing === true } };
}

export async function saveDetails(sql: Sql, rentalId: string, contentId: string, details: Details, locale: Locale): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      update content_versions
      set title = ${details.title}, url = ${details.url}, display_name = ${details.displayName}
      where id = ${contentId} and rental_id = ${rentalId} and status = 'draft'
    `;
    await tx`
      update rentals
      set email = ${details.email}, locale = ${locale},
          terms_accepted_at = coalesce(terms_accepted_at, now()),
          withdrawal_waiver_at = coalesce(withdrawal_waiver_at, now()),
          marketing_consent = ${details.marketing}
      where id = ${rentalId}
    `;
  });
}
