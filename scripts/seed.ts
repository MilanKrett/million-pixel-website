/**
 * Test data for development.
 *
 *   npm run seed                      ~300 random rentals of various sizes
 *   npm run seed -- --count=10000 --size=1   load test: 10 000 one-block rentals
 *   npm run seed:clear                remove ALL test data (also works in production)
 *
 * Test rows are marked with rentals.is_test = true and never mix with real ones.
 * Seeding is refused when APP_ENV=production, and for a non-local database
 * unless --remote is given (e.g. a staging Supabase project).
 */
import { randomUUID } from "node:crypto";
import { closeDb, db, type Sql } from "@/lib/db";
import { loadSettings } from "@/lib/settings/load";
import { wallGrid } from "@/lib/settings/schema";
import { storage } from "@/lib/storage";
import { renderWall } from "@/lib/wall/render";
import { createRng, makeTestTile, type Rng } from "@/lib/wall/test-tiles";
import { isProduction, loadEnv, requireEnv } from "./lib/env";
import { isLocalDatabaseUrl, startLocalDb, type LocalDbHandle } from "./lib/local-db";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"] as const;
  }),
);

const WORDS_A = ["Pixel", "Retro", "Happy", "Golden", "Little", "Blue", "Cosmic", "Tatra", "Danube", "Lucky", "Sunny", "Crazy", "Tiny", "Super", "Royal", "Wild"];
const WORDS_B = ["Bakery", "Cafe", "Studio", "Garage", "Bikes", "Games", "Club", "Shop", "Records", "Pizza", "Books", "Garden", "Design", "Travel", "Yoga", "Tattoo"];
const GREETINGS = ["Hello world!", "Hi mom!", "Happy birthday Jana", "Greetings from Kosice", "I was here 2026", "Marry me, Eva?", "Go team!", "Pixel art forever", "Ahoj Bratislava", "Love you Peter"];
const NAMES = ["Jana", "Peter K.", "pixel_fan", "Martin", "Lucia & Tomas", "Studio 42", "Eva", "anonymous artist", "Miro", "Zuzka", "The Club", "Ondrej", "Katka", "Daniel"];
const DOMAINS = ["example.com", "example.org", "example.net", "shop.example.com", "www.example.com"];

interface Size {
  w: number;
  h: number;
}

function randomSize(rng: Rng): Size {
  const r = rng();
  if (r < 0.45) return { w: 1 + Math.floor(rng() * 2), h: 1 + Math.floor(rng() * 2) };
  if (r < 0.75) return { w: 2 + Math.floor(rng() * 3), h: 2 + Math.floor(rng() * 3) };
  if (r < 0.9) return { w: 4 + Math.floor(rng() * 5), h: 3 + Math.floor(rng() * 4) };
  if (r < 0.98) return rng() < 0.5 ? { w: 10, h: 10 } : { w: 10 + Math.floor(rng() * 6), h: 4 + Math.floor(rng() * 5) };
  return rng() < 0.5 ? { w: 20, h: 10 } : { w: 15, h: 15 };
}

function randomTitle(rng: Rng, n: number): string {
  if (rng() < 0.3) return GREETINGS[Math.floor(rng() * GREETINGS.length)];
  return `${WORDS_A[Math.floor(rng() * WORDS_A.length)]} ${WORDS_B[Math.floor(rng() * WORDS_B.length)]} #${n}`;
}

async function seed(sql: Sql): Promise<void> {
  const count = Math.max(1, Number(args.get("count") ?? 300));
  const fixedSize = args.has("size") ? Math.max(1, Number(args.get("size"))) : null;
  const rng = createRng(Number(args.get("seed") ?? Date.now()));
  const settings = await loadSettings(sql);
  const grid = wallGrid(settings);

  // Occupancy of the whole wall, including real rentals.
  const occupied = new Uint8Array(grid.cols * grid.rows);
  for (const c of await sql<{ bx: number; by: number }[]>`select bx, by from block_cells`) occupied[c.by * grid.cols + c.bx] = 1;
  const isFree = (x: number, y: number, s: Size) => {
    if (x + s.w > grid.cols || y + s.h > grid.rows) return false;
    for (let yy = y; yy < y + s.h; yy++) for (let xx = x; xx < x + s.w; xx++) if (occupied[yy * grid.cols + xx]) return false;
    return true;
  };
  const occupy = (x: number, y: number, s: Size) => {
    for (let yy = y; yy < y + s.h; yy++) for (let xx = x; xx < x + s.w; xx++) occupied[yy * grid.cols + xx] = 1;
  };

  const placed: Array<{ x: number; y: number } & Size> = [];
  if (fixedSize === 1) {
    // Fast path for load tests: shuffle all free blocks.
    const free: number[] = [];
    occupied.forEach((v, i) => !v && free.push(i));
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    for (const i of free.slice(0, count)) placed.push({ x: i % grid.cols, y: Math.floor(i / grid.cols), w: 1, h: 1 });
  } else {
    for (let n = 0; n < count; n++) {
      const size = fixedSize ? { w: fixedSize, h: fixedSize } : randomSize(rng);
      for (let attempt = 0; attempt < 200; attempt++) {
        const x = Math.floor(rng() * (grid.cols - size.w + 1));
        const y = Math.floor(rng() * (grid.rows - size.h + 1));
        if (isFree(x, y, size)) {
          occupy(x, y, size);
          placed.push({ x, y, ...size });
          break;
        }
      }
    }
  }
  if (placed.length === 0) {
    console.log("✖ No free space left for test rentals.");
    return;
  }

  const now = Date.now();
  const DAY = 86_400_000;
  const rentals: Record<string, unknown>[] = [];
  const contents: Record<string, unknown>[] = [];
  const tiles: Array<{ path: string; w: number; h: number; label: string }> = [];

  placed.forEach((p, i) => {
    const id = randomUUID();
    const roll = rng();
    const status = roll < 0.9 ? "active" : roll < 0.95 ? "in_review" : roll < 0.98 ? "hidden" : "hold";
    // Bought places stay for good: no end date.
    const startsAt = new Date(now - Math.floor(rng() * 300) * DAY - Math.floor(rng() * DAY));
    const paid = status !== "hold";
    const title = randomTitle(rng, i + 1);
    const label = title.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase() || "PX";

    rentals.push({
      id,
      email: `test+${i + 1}@example.com`,
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      status: status === "hidden" ? "active" : status,
      hold_expires_at: status === "hold" ? new Date(now + 15 * 60_000) : null,
      starts_at: paid && status !== "in_review" ? startsAt : null,
      price_cents: Math.round(p.w * p.h * grid.block * grid.block * settings.price_cents_per_pixel),
      paid_at: paid ? new Date(Math.min(now - 60_000, startsAt.getTime() + Math.floor(rng() * DAY))) : null,
      hidden_at: status === "hidden" ? new Date(now - DAY) : null,
      is_test: true,
    });

    if (status === "hold") return;
    const contentId = randomUUID();
    const path = `rentals/${id}/${contentId}.png`;
    const hasUrl = rng() < 0.8;
    contents.push({
      id: contentId,
      rental_id: id,
      kind: "seed",
      png_path: path,
      title,
      url: hasUrl ? `https://${DOMAINS[Math.floor(rng() * DOMAINS.length)]}/test/${i + 1}` : null,
      display_name: rng() < 0.75 ? NAMES[Math.floor(rng() * NAMES.length)] : null,
      status: status === "in_review" ? "pending" : "approved",
      decided_at: status === "in_review" ? null : startsAt,
    });
    tiles.push({ path, w: p.w * grid.block, h: p.h * grid.block, label });
  });

  console.log(`• Inserting ${rentals.length} test rentals and generating ${tiles.length} tile images…`);
  // Tiles are uploaded inside the transaction: if anything fails, no rows are
  // left behind pointing to missing files.
  await sql.begin(async (tx) => {
    for (const chunk of chunks(rentals, 1000)) await tx`insert into rentals ${tx(chunk)}`;
    for (const chunk of chunks(contents, 1000)) await tx`insert into content_versions ${tx(chunk)}`;
    const cells: Record<string, unknown>[] = [];
    for (const r of rentals) {
      for (let y = r.y as number; y < (r.y as number) + (r.h as number); y++) {
        for (let x = r.x as number; x < (r.x as number) + (r.w as number); x++) cells.push({ bx: x, by: y, rental_id: r.id });
      }
    }
    for (const chunk of chunks(cells, 5000)) await tx`insert into block_cells ${tx(chunk)}`;
    await tx`
      update rentals r set active_content_id = c.id
      from content_versions c
      where c.rental_id = r.id and c.status = 'approved' and r.is_test and r.active_content_id is null
    `;

    let done = 0;
    const queue = [...tiles];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let t = queue.shift(); t; t = queue.shift()) {
          const png = await makeTestTile(t.w, t.h, rng, t.label).encodePng();
          await storage().put("content", t.path, png, { contentType: "image/png" });
          if (++done % 2000 === 0) console.log(`  ${done}/${tiles.length} tiles`);
        }
      }),
    );
  });

  const result = await renderWall(sql, { full: true });
  console.log(`✓ Seeded ${rentals.length} test rentals; wall image v${result?.version} rendered in ${result?.ms} ms`);
}

async function clear(sql: Sql): Promise<void> {
  const files = await sql<{ png_path: string | null; source_path: string | null }[]>`
    select c.png_path, c.source_path from content_versions c join rentals r on r.id = c.rental_id where r.is_test
  `;
  const paths = files.flatMap((f) => [f.png_path, f.source_path]).filter((p): p is string => Boolean(p));
  const [{ count }] = await sql<{ count: number }[]>`
    with deleted as (delete from rentals where is_test returning 1) select count(*)::int as count from deleted
  `;
  for (const chunk of chunks(paths, 500)) await storage().remove("content", chunk);
  const result = await renderWall(sql, { full: true });
  console.log(`✓ Removed ${count} test rentals and ${paths.length} files; wall image v${result?.version}`);
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Ask a running dev server to drop its cached wall data (best effort). */
async function revalidate(): Promise<void> {
  const site = process.env.SITE_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${site}/api/internal/revalidate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) console.log("✓ Site cache refreshed");
  } catch {
    // The site is not running; it will pick up the change within 30 s anyway.
  }
}

async function main(): Promise<void> {
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  const clearing = args.has("clear");
  if (!clearing && isProduction()) {
    console.error("✖ Test data cannot be created in production (APP_ENV=production).");
    process.exit(1);
  }
  const local = isLocalDatabaseUrl(url);
  if (!clearing && !local && !args.has("remote")) {
    console.error("✖ DATABASE_URL is not the local database. Add --remote to seed a staging database on purpose.");
    process.exit(1);
  }

  let handle: LocalDbHandle | null = null;
  if (local) handle = await startLocalDb();
  try {
    const sql = db();
    if (clearing) await clear(sql);
    else await seed(sql);
  } finally {
    await closeDb();
    if (handle && !handle.alreadyRunning) await handle.stop();
  }
  await revalidate();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
