/**
 * Database commands.
 *
 *   npm run db:start     start the local database in the background
 *   npm run db:stop      stop the local database
 *   npm run db:migrate   apply migrations to DATABASE_URL (local or Supabase)
 *   npm run db:reset     wipe the LOCAL database and migrate again
 */
import { closeDb, db } from "@/lib/db";
import { isProduction, loadEnv, requireEnv } from "./lib/env";
import { applyLocalShim, dropLocalDatabase, isLocalDatabaseUrl, startLocalDb, stopLocalDb } from "./lib/local-db";
import { runMigrations } from "./lib/migrate";

async function migrate(): Promise<void> {
  const url = requireEnv("DATABASE_URL");
  const local = isLocalDatabaseUrl(url);
  const handle = local ? await startLocalDb() : null;
  try {
    const sql = db();
    if (local) await applyLocalShim(sql);
    const { applied, settingsAdded } = await runMigrations(sql);
    console.log(
      applied.length
        ? `✓ Applied ${applied.length} migration(s): ${applied.join(", ")}`
        : "✓ Database schema is up to date",
    );
    if (settingsAdded) console.log(`✓ Added ${settingsAdded} default setting(s)`);
  } finally {
    await closeDb();
    if (handle && !handle.alreadyRunning) await handle.stop();
  }
}

async function start(): Promise<void> {
  const handle = await startLocalDb();
  console.log(
    handle.alreadyRunning
      ? "• The local database is already running on port 54329."
      : "✓ Local database running on postgres://postgres:postgres@127.0.0.1:54329/pixelwall (stop it with npm run db:stop)",
  );
}

async function stop(): Promise<void> {
  await stopLocalDb();
  console.log("✓ Local database stopped");
}

async function reset(): Promise<void> {
  const url = requireEnv("DATABASE_URL");
  if (!isLocalDatabaseUrl(url) || isProduction()) {
    console.error("✖ db:reset only works on the local development database.");
    process.exit(1);
  }
  const handle = await startLocalDb();
  try {
    await dropLocalDatabase();
    console.log("✓ Local database wiped");
  } finally {
    if (!handle.alreadyRunning) await handle.stop();
  }
  await migrate();
}

async function main(): Promise<void> {
  loadEnv();
  const command = process.argv[2];
  switch (command) {
    case "migrate":
      return migrate();
    case "start":
      return start();
    case "stop":
      return stop();
    case "reset":
      return reset();
    default:
      console.error("Usage: tsx scripts/db.ts <migrate|start|stop|reset>");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
