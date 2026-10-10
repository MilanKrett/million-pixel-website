/**
 * Redraw the wall image.
 *
 *   npm run wall:render              draw pending changes only
 *   npm run wall:render -- --full    rebuild the whole wall from the tiles
 */
import { closeDb, db } from "@/lib/db";
import { renderWall } from "@/lib/wall/render";
import { loadEnv, requireEnv } from "./lib/env";
import { isLocalDatabaseUrl, startLocalDb } from "./lib/local-db";

async function main(): Promise<void> {
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  const handle = isLocalDatabaseUrl(url) ? await startLocalDb() : null;
  try {
    const result = await renderWall(db(), { full: process.argv.includes("--full") });
    console.log(
      result
        ? `✓ Wall image v${result.version} (${result.full ? "full rebuild" : `${result.rects} changed area(s)`}, ${result.tiles} tile(s), ${result.ms} ms)`
        : "✓ Nothing to redraw",
    );
  } finally {
    await closeDb();
    if (handle && !handle.alreadyRunning) await handle.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
