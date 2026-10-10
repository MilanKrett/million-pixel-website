import type { Sql } from "@/lib/db";
import { rectInsideGrid, type Rect } from "@/lib/geometry";
import { wallGrid, type Settings } from "@/lib/settings/schema";
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
  | { ok: true; id: string; no: number; token: string; expiresAt: Date }
  | { ok: false; reason: "taken"; blocks: [number, number][]; suggestions: Rect[] }
  | { ok: false; reason: HoldError };

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
  input: { rect: Rect; clientHash: string; locale: "en" | "sk"; replaceId?: string | null; replaceTokenHash?: string | null },
): Promise<HoldResult> {
  if (settings.sales_paused) return { ok: false, reason: "sales_paused" };
  const invalid = validateRect(settings, input.rect);
  if (invalid) return { ok: false, reason: invalid };
  const { x, y, w, h } = input.rect;
  const token = newToken();

  try {
    const row = await sql.begin(async (tx) => {
      // Starting a new order from the same browser gives up the previous reservation.
      if (input.replaceId && input.replaceTokenHash) {
        await tx`
          update rentals set status = 'expired'
          where id = ${input.replaceId} and order_token_hash = ${input.replaceTokenHash} and status = 'hold'
        `;
      }
      const [{ active }] = await tx<{ active: number }[]>`
        select count(*)::int as active from rentals
        where client_hash = ${input.clientHash}
          and status in ('hold', 'awaiting_payment')
          and not rental_hold_is_stale(status, hold_expires_at)
      `;
      if (active >= settings.max_active_holds) return null;

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
      return rental;
    });
    if (!row) return { ok: false, reason: "rate_limited" };
    return { ok: true, id: row.id, no: row.no, token, expiresAt: row.hold_expires_at };
  } catch (error) {
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

/** Give up a reservation that has not been paid. */
export async function releaseHold(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql`
    update rentals set status = 'expired'
    where id = ${id} and status in ('hold', 'awaiting_payment')
    returning id
  `;
  if (rows.length) {
    await sql`update payments set status = 'expired' where rental_id = ${id} and status = 'pending'`;
  }
  return rows.length > 0;
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
