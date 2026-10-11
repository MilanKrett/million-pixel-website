import { randomUUID } from "node:crypto";
import type { Locale } from "@/i18n/config";
import type { Sql } from "@/lib/db";
import { rectInsideGrid, type Rect } from "@/lib/geometry";
import { paymentProvider } from "@/lib/payments/provider";
import { wallGrid, type Settings } from "@/lib/settings/schema";
import { storage } from "@/lib/storage";
import { latestDraft } from "./order";
import { findFreeSpots, occupancyGrid, type Grid } from "./space";
import { hashToken, newToken } from "./tokens";

/**
 * Reserving space. A reservation ("hold") is a rental row plus one
 * block_cells row per block, inserted in one transaction: the primary key on
 * (bx, by) makes it impossible for two orders to get the same block, however
 * close together they arrive.
 */

export type HoldError = "invalid" | "too_small" | "too_large" | "sales_paused" | "rate_limited";

export type HoldResult =
  | { ok: true; id: string; no: number; token: string; expiresAt: Date; carriedContent: boolean }
  | { ok: false; reason: "taken"; blocks: [number, number][]; suggestions: Rect[] }
  | { ok: false; reason: HoldError };

/** The order a new reservation replaces ("Change place" or "Reserve again"). */
interface PreviousOrder {
  id: string;
  w: number;
  h: number;
  status: string;
}

/** Occupied blocks, ignoring reservations that can no longer be completed. */
export async function loadOccupancy(sql: Sql, settings: Settings): Promise<Grid> {
  const { cols, rows } = wallGrid(settings);
  const cells = await sql<{ bx: number; by: number }[]>`
    select bc.bx, bc.by
    from block_cells bc
    join rentals r on r.id = bc.rental_id
    where not rental_hold_is_stale(r.status, r.hold_expires_at)
  `;
  return occupancyGrid(cols, rows, cells);
}

export function validateRect(settings: Settings, rect: Rect): HoldError | null {
  const { cols, rows } = wallGrid(settings);
  if (!rectInsideGrid(rect, cols, rows)) return "invalid";
  const blocks = rect.w * rect.h;
  if (blocks < settings.min_blocks) return "too_small";
  if (settings.max_blocks !== null && blocks > settings.max_blocks) return "too_large";
  return null;
}

export async function suggestSpots(sql: Sql, settings: Settings, w: number, h: number, near?: { x: number; y: number }) {
  const grid = await loadOccupancy(sql, settings);
  return findFreeSpots(grid, w, h, { near, nearest: 3, random: 3 });
}

export async function createHold(
  sql: Sql,
  settings: Settings,
  input: { rect: Rect; clientHash: string; locale: Locale; replaceId?: string | null; replaceTokenHash?: string | null },
): Promise<HoldResult> {
  if (settings.sales_paused) return { ok: false, reason: "sales_paused" };
  const invalid = validateRect(settings, input.rect);
  if (invalid) return { ok: false, reason: invalid };
  const { x, y, w, h } = input.rect;
  const token = newToken();
  let previous: PreviousOrder | null = null;
  let cancelledSessions: string[] = [];

  try {
    const row = await sql.begin(async (tx) => {
      // A new reservation from the same browser replaces the unpaid order it
      // had (its blocks are freed first, so the new place may overlap the old).
      if (input.replaceId && input.replaceTokenHash) {
        [previous = null] = await tx<PreviousOrder[]>`
          select id, w, h, status from rentals
          where id = ${input.replaceId} and order_token_hash = ${input.replaceTokenHash}
            and status in ('hold', 'awaiting_payment', 'expired')
          for update
        `;
        if (previous && previous.status !== "expired") {
          await tx`update rentals set status = 'expired' where id = ${previous.id}`;
          const sessions = await tx<{ stripe_session_id: string }[]>`
            update payments set status = 'expired' where rental_id = ${previous.id} and status = 'pending'
            returning stripe_session_id
          `;
          cancelledSessions = sessions.map((s) => s.stripe_session_id);
        }
      }
      const [{ active }] = await tx<{ active: number }[]>`
        select count(*)::int as active from rentals
        where client_hash = ${input.clientHash}
          and status in ('hold', 'awaiting_payment')
          and not rental_hold_is_stale(status, hold_expires_at)
      `;
      // Throwing rolls back the replacement too: the buyer keeps the old place.
      if (active >= settings.max_active_holds) throw new RateLimited();

      // Reservations in the way that can no longer be completed are released first.
      await tx`
        update rentals set status = 'expired'
        where id in (
          select distinct bc.rental_id from block_cells bc join rentals r on r.id = bc.rental_id
          where bc.bx between ${x} and ${x + w - 1} and bc.by between ${y} and ${y + h - 1}
            and rental_hold_is_stale(r.status, r.hold_expires_at)
        )
      `;
      const [rental] = await tx<{ id: string; no: number; hold_expires_at: Date }[]>`
        insert into rentals (x, y, w, h, status, hold_expires_at, order_token_hash, client_hash, locale)
        values (${x}, ${y}, ${w}, ${h}, 'hold', now() + make_interval(mins => ${settings.hold_minutes}),
                ${hashToken(token)}, ${input.clientHash}, ${input.locale})
        returning id, no, hold_expires_at
      `;
      await tx`
        insert into block_cells (bx, by, rental_id)
        select gx, gy, ${rental.id}
        from generate_series(${x}::int, ${x + w - 1}::int) gx
        cross join generate_series(${y}::int, ${y + h - 1}::int) gy
      `;
      if (previous) {
        // Keep what the buyer already entered. Consents are asked for again.
        await tx`
          update rentals r
          set email = p.email, marketing_consent = p.marketing_consent
          from rentals p
          where r.id = ${rental.id} and p.id = ${previous.id}
        `;
      }
      return rental;
    });
    await cancelCheckouts(cancelledSessions);
    // The picture fits only an area of the same size.
    const prev = previous as PreviousOrder | null;
    const carriedContent = prev !== null && prev.w === w && prev.h === h && (await copyDraft(sql, prev.id, row.id));
    return { ok: true, id: row.id, no: row.no, token, expiresAt: row.hold_expires_at, carriedContent };
  } catch (error) {
    if (error instanceof RateLimited) return { ok: false, reason: "rate_limited" };
    if ((error as { code?: string }).code !== "23505") throw error;
    // Someone was faster: say which blocks are taken and offer the nearest free spots.
    const blocks = await sql<{ bx: number; by: number }[]>`
      select bc.bx, bc.by from block_cells bc join rentals r on r.id = bc.rental_id
      where bc.bx between ${x} and ${x + w - 1} and bc.by between ${y} and ${y + h - 1}
        and not rental_hold_is_stale(r.status, r.hold_expires_at)
      order by bc.by, bc.bx
      limit 500
    `;
    const { nearest } = await suggestSpots(sql, settings, w, h, { x: x + w / 2, y: y + h / 2 });
    return { ok: false, reason: "taken", blocks: blocks.map((b) => [b.bx, b.by]), suggestions: nearest };
  }
}

class RateLimited extends Error {}

/** Stop payment sessions of a replaced or released order, so they can no longer be paid. */
async function cancelCheckouts(sessionIds: string[]): Promise<void> {
  if (!sessionIds.length) return;
  const provider = paymentProvider();
  // A session that cannot be stopped expires with the reservation anyway, and
  // a late payment is handled (and refunded if needed) by completeCheckout.
  await Promise.all(sessionIds.map((s) => provider.expireCheckout(s).catch((e) => console.error("expireCheckout failed", e))));
}

/**
 * Copy the latest draft (picture and texts) of a replaced order to the new
 * one. The files are copied, not shared, so cleaning up either order never
 * removes the other's picture.
 */
async function copyDraft(sql: Sql, fromId: string, toId: string): Promise<boolean> {
  const draft = await latestDraft(sql, fromId);
  if (!draft?.png_path) return false;
  try {
    const store = storage();
    const id = randomUUID();
    const png = await store.get("content", draft.png_path);
    if (!png) return false;
    const pngPath = `rentals/${toId}/${id}.png`;
    await store.put("content", pngPath, png, { contentType: "image/png" });
    let sourcePath: string | null = null;
    if (draft.source_path) {
      const source = await store.get("content", draft.source_path);
      if (source) {
        const ext = draft.source_path.slice(draft.source_path.lastIndexOf(".") + 1);
        sourcePath = `rentals/${toId}/${id}-source.${ext}`;
        await store.put("content", sourcePath, source, { contentType: CONTENT_TYPES[ext] ?? "application/octet-stream" });
      }
    }
    await sql`
      insert into content_versions (id, rental_id, kind, source_path, png_path, title, url, display_name, status, params)
      values (${id}, ${toId}, ${draft.kind}, ${sourcePath}, ${pngPath}, ${draft.title}, ${draft.url}, ${draft.display_name}, 'draft',
              ${sql.json(draft.params as never)})
    `;
    return true;
  } catch (error) {
    // The new reservation stands; the buyer can upload the picture again.
    console.error("Copying the draft to the new reservation failed", error);
    return false;
  }
}

const CONTENT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/** Give up a reservation that has not been paid. */
export async function releaseHold(sql: Sql, id: string): Promise<boolean> {
  const sessions = await sql.begin(async (tx) => {
    const rows = await tx`
      update rentals set status = 'expired'
      where id = ${id} and status in ('hold', 'awaiting_payment')
      returning id
    `;
    if (!rows.length) return null;
    return tx<{ stripe_session_id: string }[]>`
      update payments set status = 'expired' where rental_id = ${id} and status = 'pending'
      returning stripe_session_id
    `;
  });
  if (!sessions) return false;
  await cancelCheckouts(sessions.map((s) => s.stripe_session_id));
  return true;
}

/**
 * Housekeeping (every minute): mark reservations that can no longer be
 * completed as expired, which frees their blocks. Correctness does not depend
 * on this job: every query already treats such reservations as free.
 */
export async function expireStaleOrders(sql: Sql): Promise<number> {
  return sql.begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update rentals set status = 'expired'
      where status in ('hold', 'awaiting_payment') and rental_hold_is_stale(status, hold_expires_at)
      returning id
    `;
    if (rows.length) {
      await tx`
        update payments set status = 'expired'
        where status = 'pending' and rental_id in ${tx(rows.map((r) => r.id))}
      `;
    }
    return rows.length;
  });
}
