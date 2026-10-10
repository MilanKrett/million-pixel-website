import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { ensureDefaultSettings } from "@/lib/settings/load";

const MIGRATIONS_DIR = path.resolve("supabase/migrations");
// Arbitrary constant: serialises concurrent migration runs (e.g. two deploys).
const MIGRATION_LOCK = 7_210_001;

/**
 * Apply pending SQL files from supabase/migrations in name order, all in one
 * transaction, then add default values for any new settings.
 */
export async function runMigrations(sql: postgres.Sql): Promise<{ applied: string[]; settingsAdded: number }> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await tx`
      create table if not exists public.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;
    await tx`alter table public.schema_migrations enable row level security`;

    const done = new Set((await tx<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name));
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const text = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await tx.unsafe(text);
      await tx`insert into public.schema_migrations (name) values (${file})`;
      applied.push(file);
    }

    const settingsAdded = await ensureDefaultSettings(tx as unknown as postgres.Sql);
    return { applied, settingsAdded };
  });
}
