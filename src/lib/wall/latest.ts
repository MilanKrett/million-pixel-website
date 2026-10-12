import type { Sql } from "@/lib/db";

/** A place on the wall for the "Newest on the wall" page. */
export interface LatestSpot {
  no: number;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  name: string | null;
  /** First day on the wall (ISO). */
  since: string | null;
}

/** The newest approved places on the wall (not the admin's own reservations). */
export async function loadLatestSpots(sql: Sql, limit = 50): Promise<LatestSpot[]> {
  const rows = await sql<{ no: number; x: number; y: number; w: number; h: number; title: string; name: string | null; starts_at: Date | null }[]>`
    select r.no, r.x, r.y, r.w, r.h, c.title, c.display_name as name, r.starts_at
    from rentals r
    join content_versions c on c.id = r.active_content_id
    where rental_is_displayed(r.status, r.hidden_at, r.active_content_id) and not r.is_reserved
    order by r.starts_at desc nulls last, r.no desc
    limit ${limit}
  `;
  return rows.map((r) => ({ no: r.no, x: r.x, y: r.y, w: r.w, h: r.h, title: r.title, name: r.name, since: r.starts_at ? r.starts_at.toISOString() : null }));
}

/** One place that is on the wall now, by its public number (share pages). */
export async function loadSpot(sql: Sql, no: number): Promise<LatestSpot | null> {
  if (!Number.isSafeInteger(no) || no <= 0) return null;
  const [r] = await sql<{ no: number; x: number; y: number; w: number; h: number; title: string; name: string | null; starts_at: Date | null }[]>`
    select r.no, r.x, r.y, r.w, r.h, c.title, c.display_name as name, r.starts_at
    from rentals r
    join content_versions c on c.id = r.active_content_id
    where r.no = ${no} and rental_is_displayed(r.status, r.hidden_at, r.active_content_id)
  `;
  return r ? { no: r.no, x: r.x, y: r.y, w: r.w, h: r.h, title: r.title, name: r.name, since: r.starts_at ? r.starts_at.toISOString() : null } : null;
}
