import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

/**
 * Local development database: a real PostgreSQL 17 server from npm binaries
 * (no Docker needed). Data lives in .data/postgres, the server log in
 * .data/postgres.log. The server is started and stopped with pg_ctl so it
 * always shuts down cleanly.
 */
export const LOCAL_DB = {
  host: "127.0.0.1",
  port: 54329,
  user: "postgres",
  password: "postgres",
  database: "pixelwall",
  dir: path.resolve(".data/postgres"),
  log: path.resolve(".data/postgres.log"),
};

export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["127.0.0.1", "localhost"].includes(u.hostname) && Number(u.port) === LOCAL_DB.port;
  } catch {
    return false;
  }
}

export function isPortOpen(port: number, host = LOCAL_DB.host): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function pgCtlPath(): Promise<string> {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const pkg = `@embedded-postgres/${platform}-${process.arch}`;
  const mod = (await import(pkg)) as { pg_ctl: string };
  return mod.pg_ctl;
}

function run(file: string, args: string[], options: { detached?: boolean } = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      stdio: "ignore",
      // Detached: the server must not be killed together with this process's job (Windows).
      detached: options.detached ?? false,
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

export interface LocalDbHandle {
  alreadyRunning: boolean;
  stop: () => Promise<void>;
}

/** Start the local server unless it already runs. `stop()` only stops a server this call started. */
export async function startLocalDb(): Promise<LocalDbHandle> {
  if (await isPortOpen(LOCAL_DB.port)) {
    await ensureDatabase();
    return { alreadyRunning: true, stop: async () => {} };
  }

  if (!existsSync(path.join(LOCAL_DB.dir, "PG_VERSION"))) {
    console.log("• Creating the local database in .data/postgres (first run only)…");
    const pg = new EmbeddedPostgres({
      databaseDir: LOCAL_DB.dir,
      port: LOCAL_DB.port,
      user: LOCAL_DB.user,
      password: LOCAL_DB.password,
      persistent: true,
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      onLog: () => {},
      onError: () => {},
    });
    await pg.initialise();
  }

  const pgCtl = await pgCtlPath();
  const code = await run(
    pgCtl,
    ["start", "-D", LOCAL_DB.dir, "-l", LOCAL_DB.log, "-w", "-t", "60", "-o", `-p ${LOCAL_DB.port} -c listen_addresses=127.0.0.1`],
    { detached: true },
  );
  if (code !== 0 || !(await isPortOpen(LOCAL_DB.port))) {
    throw new Error(`The local database did not start (pg_ctl exit code ${code}). See ${LOCAL_DB.log}`);
  }
  await ensureDatabase();
  return { alreadyRunning: false, stop: stopLocalDb };
}

/** Clean ("fast") shutdown of the local server. */
export async function stopLocalDb(): Promise<void> {
  if (!existsSync(path.join(LOCAL_DB.dir, "postmaster.pid"))) return;
  const pgCtl = await pgCtlPath();
  await run(pgCtl, ["stop", "-D", LOCAL_DB.dir, "-m", "fast", "-w", "-t", "60"]);
}

function adminClient() {
  return postgres({
    host: LOCAL_DB.host,
    port: LOCAL_DB.port,
    user: LOCAL_DB.user,
    password: LOCAL_DB.password,
    database: "postgres",
    onnotice: () => {},
  });
}

async function ensureDatabase(): Promise<void> {
  const admin = adminClient();
  try {
    const rows = await admin`select 1 from pg_database where datname = ${LOCAL_DB.database}`;
    if (rows.length === 0) await admin.unsafe(`create database ${LOCAL_DB.database}`);
  } finally {
    await admin.end({ timeout: 2 });
  }
}

export async function dropLocalDatabase(): Promise<void> {
  const admin = adminClient();
  try {
    await admin.unsafe(`drop database if exists ${LOCAL_DB.database} with (force)`);
    await admin.unsafe(`create database ${LOCAL_DB.database}`);
  } finally {
    await admin.end({ timeout: 2 });
  }
}

/** Objects that Supabase provides (auth schema, API roles), recreated locally. */
export async function applyLocalShim(sql: postgres.Sql): Promise<void> {
  const shim = await readFile(path.resolve("scripts/sql/local-supabase-shim.sql"), "utf8");
  await sql.unsafe(shim);
}
