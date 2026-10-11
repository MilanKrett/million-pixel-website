import type { Sql } from "@/lib/db";
import { boundingRect, dedupeRects, rectsIntersect, type Rect } from "@/lib/geometry";
import { loadSettings } from "@/lib/settings/load";
import { wallGrid, type WallGrid } from "@/lib/settings/schema";
import { storage } from "@/lib/storage";
import { EMPTY_COLOR, Raster, type Rgb } from "./raster";

/**
 * The wall image is one 1000 × 1000 picture. After every change the renderer
 * takes the previous version, redraws only the changed rectangles (queued in
 * `wall_dirty` by a database trigger) and stores a new numbered version as
 * lossless WebP + PNG. A full rebuild from scratch runs once a day as a check.
 */

// Arbitrary constant: only one renderer may work on the wall at a time.
const RENDER_LOCK = 7_210_002;
// Above this share of the wall, a full rebuild is cheaper than patching.
const FULL_REBUILD_RATIO = 0.5;
// Colour drawn where a displayed rental's tile cannot be loaded.
const MISSING_TILE_COLOR: Rgb = [0xcc, 0xcc, 0xcc];
const YEAR_SECONDS = 31_536_000;

export interface RenderResult {
  version: number;
  full: boolean;
  rects: number;
  tiles: number;
  ms: number;
}

interface DisplayedRental extends Rect {
  id: string;
  png_path: string | null;
}

// Last rendered wall kept in memory, so warm server instances do not need to
// download and decode the previous version again.
let memo: { version: number; raster: Raster } | null = null;

export function wallImagePath(version: number, ext: "png" | "webp"): string {
  return `v${version}.${ext}`;
}

/**
 * Render pending changes. Returns null when there was nothing to do.
 * Safe to call from several places at once: callers queue on an advisory lock
 * and the later ones find nothing left to draw.
 */
export async function renderWall(sql: Sql, options: { full?: boolean } = {}): Promise<RenderResult | null> {
  const started = Date.now();
  const settings = await loadSettings(sql);
  const grid = wallGrid(settings);

  const outcome = await sql.begin(async (tx) => {
    await tx`set local lock_timeout = '60s'`;
    await tx`select pg_advisory_xact_lock(${RENDER_LOCK})`;

    const [latest] = await tx<{ id: number; image_path: string }[]>`
      select id, image_path from wall_versions order by id desc limit 1
    `;
    const dirty = await tx<(Rect & { id: string })[]>`
      select id::text, x, y, w, h from wall_dirty order by id
    `;
    const maxDirtyId = dirty.length ? dirty[dirty.length - 1].id : null;

    // Hundreds of queued changes (e.g. after a bulk import) are cheaper to redraw in one go.
    let full = Boolean(options.full) || !latest || dirty.length > 500;
    if (!full && dirty.length === 0) return null;

    let canvas: Raster | null = null;
    let rects: Rect[] = [];
    if (!full) {
      rects = dedupeRects(dirty.map(({ x, y, w, h }) => ({ x, y, w, h })));
      const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
      if (area > grid.cols * grid.rows * FULL_REBUILD_RATIO) full = true;
      else canvas = await loadBase(latest, grid);
      if (!canvas) full = true;
    }

    if (full) {
      canvas = Raster.filled(grid.width, grid.height, EMPTY_COLOR);
      rects = [{ x: 0, y: 0, w: grid.cols, h: grid.rows }];
    }
    const target = canvas!;

    for (const r of rects) {
      target.fill(r.x * grid.block, r.y * grid.block, r.w * grid.block, r.h * grid.block, EMPTY_COLOR);
    }

    const bounds = boundingRect(rects)!;
    const displayed = await tx<DisplayedRental[]>`
      select r.id::text, r.x, r.y, r.w, r.h, c.png_path
      from rentals r
      join content_versions c on c.id = r.active_content_id
      where rental_is_displayed(r.status, r.hidden_at, r.active_content_id)
        and r.x < ${bounds.x + bounds.w} and r.x + r.w > ${bounds.x}
        and r.y < ${bounds.y + bounds.h} and r.y + r.h > ${bounds.y}
    `;
    const toDraw = full ? displayed : displayed.filter((d) => rects.some((r) => rectsIntersect(r, d)));
    await drawTiles(target, toDraw, grid);

    const [png, webp] = await Promise.all([target.encodePng(), target.encodeWebp()]);
    const [row] = await tx<{ id: number }[]>`
      insert into wall_versions (image_path, changed_rect, full_rebuild)
      values ('', ${full ? null : tx.json({ ...bounds })}, ${full})
      returning id
    `;
    const base = `v${row.id}`;
    await Promise.all([
      storage().put("wall", wallImagePath(row.id, "png"), png, { contentType: "image/png", cacheSeconds: YEAR_SECONDS }),
      storage().put("wall", wallImagePath(row.id, "webp"), webp, { contentType: "image/webp", cacheSeconds: YEAR_SECONDS }),
    ]);
    await tx`update wall_versions set image_path = ${base} where id = ${row.id}`;
    if (maxDirtyId) await tx`delete from wall_dirty where id <= ${maxDirtyId}::bigint`;

    return { raster: target, version: row.id, full, rects: rects.length, tiles: toDraw.length };
  });

  if (!outcome) return null;
  // Only remember the image once the new version is committed.
  memo = { version: outcome.version, raster: outcome.raster };
  return { version: outcome.version, full: outcome.full, rects: outcome.rects, tiles: outcome.tiles, ms: Date.now() - started };
}

async function loadBase(latest: { id: number; image_path: string } | undefined, grid: WallGrid): Promise<Raster | null> {
  if (!latest) return null;
  if (memo && memo.version === latest.id && memo.raster.width === grid.width && memo.raster.height === grid.height) {
    // Work on a copy: the memo must stay intact if this transaction rolls back.
    return new Raster(grid.width, grid.height, Buffer.from(memo.raster.data));
  }
  const file = await storage().get("wall", wallImagePath(latest.id, "png"));
  if (!file) return null;
  try {
    const raster = await Raster.decode(file);
    return raster.width === grid.width && raster.height === grid.height ? raster : null;
  } catch {
    return null;
  }
}

async function drawTiles(target: Raster, rentals: readonly DisplayedRental[], grid: WallGrid): Promise<void> {
  const CONCURRENCY = 16;
  let next = 0;
  const worker = async () => {
    while (next < rentals.length) {
      const r = rentals[next++];
      const px = { x: r.x * grid.block, y: r.y * grid.block, w: r.w * grid.block, h: r.h * grid.block };
      const tile = r.png_path ? await loadTile(r.png_path) : null;
      if (tile && tile.width === px.w && tile.height === px.h) {
        target.blit(tile, px.x, px.y);
      } else {
        console.error(`[wall] tile missing or wrong size for rental ${r.id} (${r.png_path ?? "no path"})`);
        target.fill(px.x, px.y, px.w, px.h, MISSING_TILE_COLOR);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rentals.length) }, worker));
}

async function loadTile(path: string): Promise<Raster | null> {
  try {
    const file = await storage().get("content", path);
    return file ? await Raster.decode(file) : null;
  } catch (error) {
    console.error(`[wall] cannot decode tile ${path}:`, error);
    return null;
  }
}

/**
 * Old wall images are deleted, except the 20 newest, everything from the
 * last two hours (pages cached for up to an hour may still show them) and
 * the last image of every day (daily snapshots, e.g. for a time-lapse later).
 */
export async function pruneWallVersions(sql: Sql): Promise<number> {
  const old = await sql<{ id: number }[]>`
    select v.id from wall_versions v
    where v.image_path <> ''
      and v.created_at < now() - interval '2 hours'
      and v.id < (select max(id) from wall_versions) - 20
      and v.id not in (
        select max(id) from wall_versions where image_path <> ''
        group by (created_at at time zone 'Europe/Bratislava')::date
      )
    order by v.id
    limit 500
  `;
  if (!old.length) return 0;
  await storage().remove(
    "wall",
    old.flatMap((v) => [wallImagePath(v.id, "png"), wallImagePath(v.id, "webp")]),
  );
  await sql`delete from wall_versions where id in ${sql(old.map((v) => v.id))}`;
  return old.length;
}
