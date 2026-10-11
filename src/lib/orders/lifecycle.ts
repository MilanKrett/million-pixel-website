import type { Sql } from "@/lib/db";

/**
 * Bought places stay on the wall for good. Only places an admin reserved
 * with an end date (own ads, a campaign) end: once the date has passed the
 * place leaves the wall and is free again (a trigger releases block_cells).
 */
export async function releaseEndedReservations(sql: Sql): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    update rentals set status = 'ended'
    where is_reserved and status in ('active', 'grace') and ends_at is not null and ends_at <= now()
    returning id
  `;
  if (rows.length) {
    await sql`
      insert into audit_log (action, target, details)
      select 'rental.reserved_ended', 'rental:' || id, ${sql.json({ by: "system" })}
      from unnest(${rows.map((r) => r.id)}::uuid[]) as id
    `;
  }
  return rows.length;
}
