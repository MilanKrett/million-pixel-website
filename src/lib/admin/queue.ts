import type { Sql } from "@/lib/db";
import type { AutoChecks } from "@/lib/moderation/checks";

/** One content version waiting for a moderator. */
export interface QueueItem {
  contentId: string;
  rentalId: string;
  no: number;
  rect: { x: number; y: number; w: number; h: number };
  kind: "new" | "change";
  contentKind: string;
  title: string | null;
  url: string | null;
  displayName: string | null;
  email: string | null;
  priceCents: number | null;
  waitingHours: number;
  checks: Partial<AutoChecks> | null;
  /** The content on the wall now (for changes). */
  currentContentId: string | null;
  history: { rentals: number; rejected: number; reports: number; removed: number };
}

export async function moderationQueue(sql: Sql, limit = 100): Promise<QueueItem[]> {
  const rows = await sql<
    {
      content_id: string; rental_id: string; no: number; x: number; y: number; w: number; h: number; status: string; kind: string;
      title: string | null; url: string | null; display_name: string | null; email: string | null;
      price_cents: number | null; hours: number; auto_checks: Partial<AutoChecks> | null; active_content_id: string | null;
      h_rentals: number; h_rejected: number; h_reports: number; h_removed: number;
    }[]
  >`
    select c.id as content_id, r.id as rental_id, r.no, r.x, r.y, r.w, r.h, r.status, c.kind,
           c.title, c.url, c.display_name, r.email, r.price_cents,
           (extract(epoch from now() - coalesce(c.submitted_at, c.created_at)) / 3600)::float8 as hours,
           nullif(c.auto_checks, '{}'::jsonb) as auto_checks, r.active_content_id,
           (select count(*) from rentals o where r.email is not null and lower(o.email) = lower(r.email) and o.paid_at is not null)::int as h_rentals,
           (select count(*) from content_versions oc join rentals o on o.id = oc.rental_id
              where r.email is not null and lower(o.email) = lower(r.email) and oc.status in ('rejected', 'changes_requested'))::int as h_rejected,
           (select count(*) from reports rp join rentals o on o.id = rp.rental_id where r.email is not null and lower(o.email) = lower(r.email))::int as h_reports,
           (select count(*) from rentals o where r.email is not null and lower(o.email) = lower(r.email) and o.status = 'removed')::int as h_removed
    from content_versions c
    join rentals r on r.id = c.rental_id
    where c.status = 'pending' and r.status in ('in_review', 'active', 'grace')
    order by coalesce(c.submitted_at, c.created_at)
    limit ${limit}
  `;
  return rows.map((r) => ({
    contentId: r.content_id,
    rentalId: r.rental_id,
    no: r.no,
    rect: { x: r.x, y: r.y, w: r.w, h: r.h },
    kind: r.status === "in_review" ? "new" : "change",
    contentKind: r.kind,
    title: r.title,
    url: r.url,
    displayName: r.display_name,
    email: r.email,
    priceCents: r.price_cents,
    waitingHours: r.hours,
    checks: r.auto_checks,
    currentContentId: r.active_content_id,
    history: { rentals: r.h_rentals, rejected: r.h_rejected, reports: r.h_reports, removed: r.h_removed },
  }));
}
