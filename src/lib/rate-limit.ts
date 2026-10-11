import type { Sql } from "@/lib/db";

/**
 * Fixed-window request limits kept in the database (works across serverless
 * instances). `hit` counts one request and says whether it is still allowed.
 */
export async function hit(sql: Sql, bucket: string, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [row] = await sql<{ hits: number }[]>`
    insert into rate_limits (bucket, key, window_start, hits)
    values (${bucket}, ${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    on conflict (bucket, key, window_start) do update set hits = rate_limits.hits + 1
    returning hits
  `;
  return row.hits <= limit;
}

/** Old counters are useless after their window; the cleanup job removes them. */
export async function pruneRateLimits(sql: Sql): Promise<void> {
  await sql`delete from rate_limits where window_start < now() - interval '2 days'`;
}
