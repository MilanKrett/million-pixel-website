import type { Sql } from "@/lib/db";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "./schema";

/** Read all settings from the database, merged over the defaults. */
export async function loadSettings(sql: Sql): Promise<Settings> {
  const rows = await sql<{ key: string; value: unknown }[]>`select key, value from settings`;
  return mergeSettings(rows);
}

/** Insert defaults for keys that are not stored yet. Existing values are kept. */
export async function ensureDefaultSettings(sql: Sql): Promise<number> {
  const entries = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
  }));
  const inserted = await sql`
    insert into settings (key, value)
    select e.key, e.value::jsonb
    from jsonb_to_recordset(${sql.json(entries)}) as e(key text, value text)
    on conflict (key) do nothing
    returning key
  `;
  return inserted.length;
}
