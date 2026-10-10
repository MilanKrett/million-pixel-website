/**
 * `npm run dev`: starts the local database (when DATABASE_URL points to it),
 * applies migrations and runs the Next.js dev server. Ctrl+C stops everything.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { closeDb, db } from "@/lib/db";
import { loadEnv, requireEnv } from "./lib/env";
import { applyLocalShim, isLocalDatabaseUrl, startLocalDb, type LocalDbHandle } from "./lib/local-db";
import { runMigrations } from "./lib/migrate";

async function main(): Promise<void> {
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  let handle: LocalDbHandle | null = null;

  if (isLocalDatabaseUrl(url)) {
    handle = await startLocalDb();
    console.log(handle.alreadyRunning ? "• Using the local database that is already running" : "✓ Local database started");
  }

  const sql = db();
  if (handle) await applyLocalShim(sql);
  const { applied } = await runMigrations(sql);
  if (applied.length) console.log(`✓ Applied migrations: ${applied.join(", ")}`);
  await closeDb();

  const extraArgs = process.argv.slice(2);
  // Run the Next.js CLI with this Node binary directly (no shell needed on Windows).
  const nextBin = path.resolve("node_modules/next/dist/bin/next");
  const next = spawn(process.execPath, [nextBin, "dev", ...extraArgs], {
    stdio: "inherit",
    env: process.env,
  });

  let stopping = false;
  const shutdown = async (code: number) => {
    if (stopping) return;
    stopping = true;
    if (!next.killed && next.exitCode === null) next.kill();
    if (handle && !handle.alreadyRunning) {
      await handle.stop().catch(() => {});
      console.log("✓ Local database stopped");
    }
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  next.on("exit", (code) => void shutdown(code ?? 0));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
