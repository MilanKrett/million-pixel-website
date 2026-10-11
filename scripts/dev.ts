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

  // The every-minute job (Vercel Cron in production): release expired
  // reservations and redraw the wall. The first run waits for the server.
  const portArg = extraArgs.findIndex((a) => a === "-p" || a === "--port");
  const port = portArg >= 0 ? Number(extraArgs[portArg + 1]) : Number(process.env.PORT ?? 3000);
  const cron = setInterval(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cron/minute`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
        signal: AbortSignal.timeout(50_000),
      });
      const body = (await res.json().catch(() => null)) as { expired?: number; rendered?: number | null } | null;
      if (body?.expired) console.log(`• cron: released ${body.expired} expired reservation(s)`);
    } catch {
      // The dev server may still be compiling; next minute it will answer.
    }
  }, 60_000);

  let stopping = false;
  const shutdown = async (code: number) => {
    if (stopping) return;
    stopping = true;
    clearInterval(cron);
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
