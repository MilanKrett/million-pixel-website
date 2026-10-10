import postgres from "postgres";

export type Sql = postgres.Sql;

declare global {
  var __pixelwallSql: Sql | undefined;
}

/**
 * Shared Postgres client. Works with the local embedded database and with
 * Supabase (use the connection pooler URL in production; prepared statements
 * are disabled so the transaction pooler works).
 */
export function db(): Sql {
  if (globalThis.__pixelwallSql) return globalThis.__pixelwallSql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local (see README).");
  }
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? (process.env.VERCEL ? 3 : 10)),
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    connection: { application_name: "pixelwall", TimeZone: "UTC" },
  });
  globalThis.__pixelwallSql = sql;
  return sql;
}

/** Close the shared client (scripts only). */
export async function closeDb(): Promise<void> {
  const sql = globalThis.__pixelwallSql;
  globalThis.__pixelwallSql = undefined;
  if (sql) await sql.end({ timeout: 5 });
}
