import type { Sql } from "@/lib/db";
import { wallGrid, type Settings } from "@/lib/settings/schema";
import { storage } from "@/lib/storage";
import { displayDomain } from "@/lib/url";
import { wallImagePath } from "./render";

/**
 * Compact description of the public wall, shared by the home page and
 * /api/wall.json. Rows are arrays (not objects) to keep the payload small
 * even with 10 000 rentals.
 */

/** [no, x, y, w, h, title, publicName, linkDomain, validUntil (YYYY-MM-DD)] — x/y/w/h in blocks. */
export type WallRentalRow = [number, number, number, number, number, string, string, string, string];
/** [x, y, w, h] in blocks. */
export type WallAreaRow = [number, number, number, number];

export interface WallSnapshot {
  version: number | null;
  image: { webp: string; png: string } | null;
  cols: number;
  rows: number;
  block: number;
  /** Rentals visible on the wall. */
  rentals: WallRentalRow[];
  /** Paid space whose content is not shown yet (in review, hidden). */
  taken: WallAreaRow[];
  /** Space reserved right now by someone in the middle of an order. */
  holds: WallAreaRow[];
}

export interface WallStats {
  totalPixels: number;
  rentedPixels: number;
  freePixels: number;
  activeRentals: number;
  lastRentalAt: string | null;
}

export async function loadWallSnapshot(sql: Sql, settings: Settings): Promise<WallSnapshot> {
  const grid = wallGrid(settings);
  const [[latest], rentals, taken, holds] = await Promise.all([
    sql<{ id: number }[]>`select id from wall_versions where image_path <> '' order by id desc limit 1`,
    sql<{ no: number; x: number; y: number; w: number; h: number; title: string; name: string | null; url: string | null; ends_at: Date | null }[]>`
      select r.no, r.x, r.y, r.w, r.h, c.title, c.display_name as name, c.url, r.ends_at
      from rentals r
      join content_versions c on c.id = r.active_content_id
      where rental_is_displayed(r.status, r.hidden_at, r.active_content_id)
      order by r.no
    `,
    sql<{ x: number; y: number; w: number; h: number }[]>`
      select x, y, w, h from rentals
      where status in ('in_review', 'rejected')
         or (status in ('active', 'grace') and not rental_is_displayed(status, hidden_at, active_content_id))
    `,
    sql<{ x: number; y: number; w: number; h: number }[]>`
      select x, y, w, h from rentals
      where status in ('hold', 'awaiting_payment') and not rental_hold_is_stale(status, hold_expires_at)
    `,
  ]);

  const version = latest?.id ?? null;
  return {
    version,
    image:
      version === null
        ? null
        : {
            webp: storage().publicUrl("wall", wallImagePath(version, "webp")),
            png: storage().publicUrl("wall", wallImagePath(version, "png")),
          },
    cols: grid.cols,
    rows: grid.rows,
    block: grid.block,
    rentals: rentals.map((r) => [
      r.no,
      r.x,
      r.y,
      r.w,
      r.h,
      r.title,
      r.name ?? "",
      displayDomain(r.url),
      r.ends_at ? r.ends_at.toISOString().slice(0, 10) : "",
    ]),
    taken: taken.map((r) => [r.x, r.y, r.w, r.h]),
    holds: holds.map((r) => [r.x, r.y, r.w, r.h]),
  };
}

export async function loadWallStats(sql: Sql, settings: Settings): Promise<WallStats> {
  const grid = wallGrid(settings);
  const totalPixels = grid.width * grid.height;
  const [row] = await sql<{ blocks: number; active: number; last: Date | null }[]>`
    select
      coalesce(sum(w * h) filter (where status in ('in_review', 'rejected', 'active', 'grace')), 0)::int as blocks,
      count(*) filter (where status in ('active', 'grace'))::int as active,
      max(paid_at) as last
    from rentals
  `;
  const rentedPixels = Math.min(totalPixels, row.blocks * grid.block * grid.block);
  return {
    totalPixels,
    rentedPixels,
    freePixels: totalPixels - rentedPixels,
    activeRentals: row.active,
    lastRentalAt: row.last ? row.last.toISOString() : null,
  };
}
