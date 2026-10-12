/**
 * The site on this computer, started from the desktop icon
 * (scripts/desktop/start.cmd, created by `npm run desktop:install`):
 *  1. backs up the local database and pictures once a day,
 *  2. starts the local database and applies migrations,
 *  3. builds the site when the code changed since the last build,
 *  4. runs the production server and opens the browser,
 *  5. runs the scheduled jobs (every minute and once a day).
 * Closing the window (or Ctrl+C) stops the server and the database.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb, db } from "@/lib/db";
import { dailyBackup } from "./lib/backup";
import { loadEnv, requireEnv } from "./lib/env";
import { applyLocalShim, isLocalDatabaseUrl, isPortOpen, LOCAL_DB, startLocalDb, type LocalDbHandle } from "./lib/local-db";
import { runMigrations } from "./lib/migrate";

const NEXT_BIN = path.resolve("node_modules/next/dist/bin/next");
const STATE_FILE = path.resolve(".data/desktop.json");
const say = (line: string) => console.log(line);

interface State {
  lastDaily?: string;
}

function readState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return {};
  }
}

function writeState(state: State): void {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {
    // Not important: the daily job then simply runs again next time.
  }
}

/** Newest modification time of the files a build depends on. */
function newestSource(): number {
  let newest = 0;
  const visit = (p: string) => {
    if (!existsSync(p)) return;
    const s = statSync(p);
    if (s.isDirectory()) {
      for (const name of readdirSync(p)) visit(path.join(p, name));
    } else {
      newest = Math.max(newest, s.mtimeMs);
    }
  };
  for (const p of ["src", "public", "next.config.ts", "package.json", "package-lock.json", "tsconfig.json", ".env.local", ".env"]) visit(path.resolve(p));
  return newest;
}

function needsBuild(): boolean {
  const buildId = path.resolve(".next/BUILD_ID");
  return !existsSync(buildId) || statSync(buildId).mtimeMs < newestSource();
}

function run(args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [NEXT_BIN, ...args], { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function freePort(from: number): Promise<number> {
  for (let port = from; port < from + 20; port++) {
    if (!(await isPortOpen(port, "127.0.0.1")) && !(await isPortOpen(port, "::1"))) return port;
  }
  throw new Error("No free port between 3000 and 3019.");
}

async function waitForServer(url: string, timeoutMs = 120_000): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${url}/api/stats`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", '""', url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: process.platform === "win32" }).unref();
}

let handle: LocalDbHandle | null = null;
let next: ChildProcess | null = null;
let stopping = false;
const timers: NodeJS.Timeout[] = [];

/** Stop the server and (if this script started it) the database, then quit. */
async function shutdown(code: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  for (const t of timers) clearInterval(t);
  if (next && next.exitCode === null) next.kill();
  if (handle && !handle.alreadyRunning) {
    await handle.stop().catch(() => {});
    say("✓ Local database stopped");
  }
  process.exit(code);
}

async function main(): Promise<void> {
  // SIGHUP: the console window was closed (Windows gives us a few seconds).
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => void shutdown(0));
  loadEnv();
  const url = requireEnv("DATABASE_URL");
  say("");
  say("  Million Pixel Wall — spúšťam stránku na tomto počítači / starting the site on this computer");
  say("  Zatvorením tohto okna ju vypneš / close this window to stop it");
  say("");

  if (isLocalDatabaseUrl(url)) {
    if (!(await isPortOpen(LOCAL_DB.port))) {
      try {
        const backup = dailyBackup(LOCAL_DB.dir, path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".data/storage"));
        if (backup) say(`✓ Daily backup: ${backup.dir} (${backup.files} new or changed file(s))`);
      } catch (error) {
        console.error("! The daily backup failed:", error);
      }
    }
    handle = await startLocalDb();
    say(handle.alreadyRunning ? "• Using the local database that is already running" : "✓ Local database started");
  }
  const sql = db();
  if (handle) await applyLocalShim(sql);
  const { applied } = await runMigrations(sql);
  if (applied.length) say(`✓ Applied migrations: ${applied.join(", ")}`);
  await closeDb();

  const port = await freePort(Number(process.env.PORT ?? 3000));
  // Only this computer can open the site. "localhost", not 127.0.0.1: with an
  // IP address Next.js would run the language proxy twice (see src/proxy.ts).
  const site = `http://localhost:${port}`;
  // Links in e-mails and share pages point to this server.
  const env = { ...process.env, SITE_URL: site };

  if (needsBuild()) {
    say("• The code changed: building the site (the first time takes a few minutes)…");
    const code = await run(["build"], env);
    if (code !== 0) throw new Error(`The build failed (exit code ${code}).`);
  }

  next = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port), "-H", "localhost"], { stdio: "inherit", env });
  next.on("exit", (code) => void shutdown(code ?? 0));

  if (!(await waitForServer(site))) throw new Error("The site did not start in time.");
  say("");
  say(`✓ The site runs at ${site}`);
  say(`  E-mails (test mailbox): ${site}/dev/emails · Administration: ${site}/admin`);
  say("");
  if (!process.env.DESKTOP_NO_BROWSER) openBrowser(`${site}/`);

  const job = async (name: "minute" | "daily") => {
    try {
      const res = await fetch(`${site}/api/cron/${name}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
        signal: AbortSignal.timeout(name === "daily" ? 300_000 : 50_000),
      });
      if (!res.ok) console.error(`! The ${name} job answered ${res.status}`);
      return res.ok;
    } catch (error) {
      if (!stopping) console.error(`! The ${name} job failed:`, error);
      return false;
    }
  };
  const daily = async () => {
    const state = readState();
    if (state.lastDaily && Date.now() - Date.parse(state.lastDaily) < 23 * 3600_000) return;
    if (await job("daily")) writeState({ ...state, lastDaily: new Date().toISOString() });
  };
  timers.push(setInterval(() => void job("minute"), 60_000));
  timers.push(setInterval(() => void daily(), 3600_000));
  void job("minute");
  void daily();
}

main().catch((error) => {
  console.error("");
  console.error("✖", error instanceof Error ? error.message : error);
  void shutdown(1);
});
