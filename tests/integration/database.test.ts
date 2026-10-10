import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TEST_STORAGE_DIR, applyTestEnvironment } from "./env";

applyTestEnvironment();

const { closeDb, db } = await import("@/lib/db");
const { storage } = await import("@/lib/storage");
const { renderWall, wallImagePath } = await import("@/lib/wall/render");
const { Raster } = await import("@/lib/wall/raster");
const { loadSettings } = await import("@/lib/settings/load");
const { loadWallSnapshot, loadWallStats } = await import("@/lib/wall/snapshot");

type Rect = { x: number; y: number; w: number; h: number };

/** The same transaction the order flow uses to reserve space: rental row + one row per block. */
async function reserve(sql: postgres.Sql, r: Rect, status = "hold"): Promise<string> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into rentals (x, y, w, h, status, hold_expires_at)
      values (${r.x}, ${r.y}, ${r.w}, ${r.h}, ${status}, now() + interval '15 minutes')
      returning id
    `;
    await tx`
      insert into block_cells (bx, by, rental_id)
      select gx, gy, ${row.id}
      from generate_series(${r.x}::int, ${r.x + r.w - 1}::int) gx
      cross join generate_series(${r.y}::int, ${r.y + r.h - 1}::int) gy
    `;
    return row.id;
  });
}

/** An approved rental shown on the wall, with a solid-colour tile. */
async function activeRental(r: Rect, color: [number, number, number], title = "Test"): Promise<string> {
  const sql = db();
  const id = await reserve(sql, r, "in_review");
  const contentId = randomUUID();
  const path = `rentals/${id}/${contentId}.png`;
  await storage().put("content", path, await Raster.filled(r.w * 10, r.h * 10, color).encodePng(), { contentType: "image/png" });
  await sql`
    insert into content_versions (id, rental_id, kind, png_path, title, url, display_name, status)
    values (${contentId}, ${id}, 'seed', ${path}, ${title}, 'https://example.com/', 'Tester', 'approved')
  `;
  await sql`
    update rentals set status = 'active', active_content_id = ${contentId}, starts_at = now(),
      ends_at = now() + interval '1 year', paid_at = now()
    where id = ${id}
  `;
  return id;
}

async function readWall(version: number) {
  const file = await storage().get("wall", wallImagePath(version, "png"));
  return Raster.decode(file!);
}

beforeAll(async () => {
  // Make sure the connection works before running anything.
  await db()`select 1`;
});

beforeEach(async () => {
  await db()`truncate rentals, wall_versions, wall_dirty, click_stats restart identity cascade`;
});

afterAll(async () => {
  await closeDb();
  await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
});

describe("occupancy", () => {
  it("rejects a reservation overlapping another one", async () => {
    await reserve(db(), { x: 10, y: 10, w: 5, h: 5 });
    await expect(reserve(db(), { x: 14, y: 14, w: 2, h: 2 })).rejects.toMatchObject({ code: "23505" });
    // Touching edges is fine.
    await expect(reserve(db(), { x: 15, y: 10, w: 2, h: 2 })).resolves.toBeTypeOf("string");
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int n from rentals`;
    expect(n).toBe(2);
  });

  it("lets exactly one of many simultaneous requests for the same spot win", async () => {
    // Separate connections, all fired at the same moment.
    const clients = Array.from({ length: 12 }, () => postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} }));
    try {
      const results = await Promise.allSettled(
        clients.map((c, i) => reserve(c, { x: 40 + (i % 3), y: 40 + (i % 2), w: 4, h: 4 })),
      );
      const won = results.filter((r) => r.status === "fulfilled");
      expect(won).toHaveLength(1);
      for (const r of results) {
        if (r.status === "rejected") expect((r.reason as { code?: string }).code).toBe("23505");
      }
      const [{ cells }] = await db()<{ cells: number }[]>`select count(*)::int cells from block_cells`;
      expect(cells).toBe(16);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  it("frees the blocks when a rental expires, ends, is removed or refunded", async () => {
    for (const status of ["expired", "ended", "removed", "refunded"]) {
      const id = await reserve(db(), { x: 0, y: 0, w: 3, h: 3 });
      await db()`update rentals set status = ${status} where id = ${id}`;
      const [{ n }] = await db()<{ n: number }[]>`select count(*)::int n from block_cells where rental_id = ${id}`;
      expect(n, status).toBe(0);
    }
  });

  it("keeps the blocks during review, the grace period and after a rejection", async () => {
    const id = await reserve(db(), { x: 0, y: 0, w: 2, h: 2 });
    for (const status of ["awaiting_payment", "in_review", "rejected", "active", "grace"]) {
      await db()`update rentals set status = ${status} where id = ${id}`;
      const [{ n }] = await db()<{ n: number }[]>`select count(*)::int n from block_cells where rental_id = ${id}`;
      expect(n, status).toBe(4);
    }
  });

  it("refuses rentals that end before they start", async () => {
    await expect(
      db()`insert into rentals (x, y, w, h, status, starts_at, ends_at) values (0, 0, 1, 1, 'active', now(), now() - interval '1 day')`,
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("wall image", () => {
  it("queues a redraw only when something visible changes", async () => {
    const id = await activeRental({ x: 5, y: 5, w: 2, h: 2 }, [255, 0, 0]);
    const count = async () => (await db()<{ n: number }[]>`select count(*)::int n from wall_dirty`)[0].n;
    expect(await count()).toBe(1);
    await db()`update rentals set email = 'x@example.com' where id = ${id}`;
    expect(await count()).toBe(1);
    await db()`update rentals set hidden_at = now() where id = ${id}`;
    expect(await count()).toBe(2);
    await db()`update rentals set hidden_at = null where id = ${id}`;
    expect(await count()).toBe(3);
  });

  it("draws approved rentals and redraws only what changed, identical to a full rebuild", async () => {
    const red = await activeRental({ x: 0, y: 0, w: 2, h: 1 }, [255, 0, 0]);
    await activeRental({ x: 98, y: 99, w: 2, h: 1 }, [0, 0, 255]);
    const first = await renderWall(db());
    expect(first?.full).toBe(true);
    let wall = await readWall(first!.version);
    expect(wall.getPixel(0, 0)).toEqual([255, 0, 0]);
    expect(wall.getPixel(19, 9)).toEqual([255, 0, 0]);
    expect(wall.getPixel(20, 0)).toEqual([0xf4, 0xf4, 0xf4]);
    expect(wall.getPixel(999, 999)).toEqual([0, 0, 255]);

    // Nothing queued: nothing to do.
    expect(await renderWall(db())).toBeNull();

    // Hide one rental and add another: an incremental update.
    await db()`update rentals set hidden_at = now() where id = ${red}`;
    await activeRental({ x: 50, y: 50, w: 1, h: 1 }, [0, 255, 0]);
    const second = await renderWall(db());
    expect(second?.full).toBe(false);
    expect(second!.version).toBeGreaterThan(first!.version);
    wall = await readWall(second!.version);
    expect(wall.getPixel(0, 0)).toEqual([0xf4, 0xf4, 0xf4]);
    expect(wall.getPixel(505, 505)).toEqual([0, 255, 0]);

    const full = await renderWall(db(), { full: true });
    const rebuilt = await readWall(full!.version);
    expect(rebuilt.data.equals(wall.data)).toBe(true);

    // The WebP is the same picture.
    const webp = await Raster.decode((await storage().get("wall", wallImagePath(full!.version, "webp")))!);
    expect(webp.data.equals(rebuilt.data)).toBe(true);
  });

  it("serialises concurrent renders without losing changes", async () => {
    await activeRental({ x: 1, y: 1, w: 1, h: 1 }, [10, 20, 30]);
    await renderWall(db());
    await activeRental({ x: 2, y: 2, w: 1, h: 1 }, [40, 50, 60]);
    await activeRental({ x: 3, y: 3, w: 1, h: 1 }, [70, 80, 90]);
    const results = await Promise.all([renderWall(db()), renderWall(db()), renderWall(db())]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const [{ id }] = await db()<{ id: number }[]>`select max(id) as id from wall_versions`;
    const wall = await readWall(id);
    expect(wall.getPixel(15, 15)).toEqual([10, 20, 30]);
    expect(wall.getPixel(25, 25)).toEqual([40, 50, 60]);
    expect(wall.getPixel(35, 35)).toEqual([70, 80, 90]);
  });
});

describe("public data", () => {
  it("lists visible rentals, taken space and live reservations; counts paid pixels", async () => {
    await activeRental({ x: 0, y: 0, w: 2, h: 2 }, [1, 2, 3], "Visible");
    const hidden = await activeRental({ x: 10, y: 0, w: 1, h: 1 }, [1, 2, 3], "Hidden");
    await db()`update rentals set hidden_at = now() where id = ${hidden}`;
    await reserve(db(), { x: 20, y: 0, w: 3, h: 1 }, "in_review");
    await reserve(db(), { x: 30, y: 0, w: 1, h: 1 }, "hold");
    const expired = await reserve(db(), { x: 40, y: 0, w: 1, h: 1 }, "hold");
    await db()`update rentals set hold_expires_at = now() - interval '1 minute' where id = ${expired}`;

    const settings = await loadSettings(db());
    const snap = await loadWallSnapshot(db(), settings);
    expect(snap.rentals.map((r) => r[5])).toEqual(["Visible"]);
    expect(snap.rentals[0][7]).toBe("example.com");
    expect(snap.taken).toEqual(expect.arrayContaining([[10, 0, 1, 1], [20, 0, 3, 1]]));
    expect(snap.holds).toEqual([[30, 0, 1, 1]]);

    const stats = await loadWallStats(db(), settings);
    // 4 + 1 + 3 blocks paid × 100 pixels; reservations are not rented yet.
    expect(stats.rentedPixels).toBe(800);
    expect(stats.freePixels).toBe(1_000_000 - 800);
    expect(stats.activeRentals).toBe(2);
    expect(stats.lastRentalAt).not.toBeNull();
  });
});
