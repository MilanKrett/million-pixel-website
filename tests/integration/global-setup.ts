import postgres from "postgres";
import { loadEnv } from "../../scripts/lib/env";
import { applyLocalShim, LOCAL_DB, startLocalDb } from "../../scripts/lib/local-db";
import { runMigrations } from "../../scripts/lib/migrate";
import { TEST_DATABASE, TEST_DATABASE_URL } from "./env";

/** Fresh "pixelwall_test" database on the local server for every test run. */
export default async function setup() {
  loadEnv();
  const handle = await startLocalDb();
  const admin = postgres({
    host: LOCAL_DB.host,
    port: LOCAL_DB.port,
    user: LOCAL_DB.user,
    password: LOCAL_DB.password,
    database: "postgres",
    onnotice: () => {},
  });
  await admin.unsafe(`drop database if exists ${TEST_DATABASE} with (force)`);
  await admin.unsafe(`create database ${TEST_DATABASE}`);
  await admin.end();

  const sql = postgres(TEST_DATABASE_URL, { onnotice: () => {} });
  await applyLocalShim(sql);
  await runMigrations(sql);
  await sql.end();

  return async () => {
    if (!handle.alreadyRunning) await handle.stop();
  };
}
