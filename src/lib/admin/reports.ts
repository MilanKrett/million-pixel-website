import type { Sql } from "@/lib/db";

export interface AdminReport {
  id: string;
  category: string;
  description: string | null;
  reporterEmail: string | null;
  source: string;
  status: string;
  action: string | null;
  resolution: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  rentalNo: number | null;
  rental: {
    id: string;
    no: number;
    rect: { x: number; y: number; w: number; h: number };
    status: string;
    hidden: boolean;
    contentId: string | null;
    title: string | null;
    url: string | null;
    email: string | null;
    openReports: number;
  } | null;
}

/** Reports for the moderators: open ones oldest first (child-abuse reports on top), or the last closed ones. */
export async function listReports(sql: Sql, which: "open" | "closed", limit = 100): Promise<AdminReport[]> {
  const rows = await sql<
    {
      id: string; category: string; description: string | null; reporter_email: string | null; source: string; status: string;
      action: string | null; resolution: string | null; created_at: Date; resolved_at: Date | null; rental_no: number | null;
      r_id: string | null; r_no: number | null; x: number; y: number; w: number; h: number; r_status: string | null; hidden_at: Date | null;
      content_id: string | null; title: string | null; url: string | null; email: string | null; open_reports: number;
    }[]
  >`
    select p.id, p.category, p.description, p.reporter_email, p.source, p.status, p.action, p.resolution, p.created_at, p.resolved_at, p.rental_no,
           r.id as r_id, r.no as r_no, r.x, r.y, r.w, r.h, r.status as r_status, r.hidden_at, r.email,
           coalesce(p.content_id, r.active_content_id) as content_id, c.title, c.url,
           (select count(*) from reports o where o.rental_id = p.rental_id and o.status = 'open')::int as open_reports
    from reports p
    left join rentals r on r.id = p.rental_id
    left join content_versions c on c.id = coalesce(p.content_id, r.active_content_id)
    where (${which === "open"} and p.status = 'open') or (${which === "closed"} and p.status <> 'open')
    order by
      case when ${which === "open"} then (p.category = 'child')::int else 0 end desc,
      case when ${which === "open"} then extract(epoch from p.created_at) else -extract(epoch from coalesce(p.resolved_at, p.created_at)) end
    limit ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
    reporterEmail: r.reporter_email,
    source: r.source,
    status: r.status,
    action: r.action,
    resolution: r.resolution,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    rentalNo: r.rental_no,
    rental: r.r_id
      ? {
          id: r.r_id,
          no: r.r_no!,
          rect: { x: r.x, y: r.y, w: r.w, h: r.h },
          status: r.r_status!,
          hidden: r.hidden_at !== null,
          contentId: r.content_id,
          title: r.title,
          url: r.url,
          email: r.email,
          openReports: r.open_reports,
        }
      : null,
  }));
}
