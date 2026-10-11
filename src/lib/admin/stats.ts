import type { Sql } from "@/lib/db";
import { wallGrid, type Settings } from "@/lib/settings/schema";

/** Numbers for the admin overview (spec section 10). */
export interface DashboardStats {
  revenue: { day: number; week: number; month: number; total: number };
  rentedPixels: number;
  totalPixels: number;
  activeRentals: number;
  pendingReview: number;
  overdueReview: number;
  openReports: number;
  endingSoon: number;
  /** Orders started (places reserved) and paid in the last 30 days. */
  conversion: { started: number; paid: number };
}

export async function dashboardStats(sql: Sql, settings: Settings): Promise<DashboardStats> {
  const grid = wallGrid(settings);
  const [[money], [rentals], [queue], [reports], [conversion]] = await Promise.all([
    // Net of refunds, by payment day (Slovak time).
    sql<{ day: number; week: number; month: number; total: number }[]>`
      select
        coalesce(sum(amount_cents - refunded_cents) filter (where paid_at >= date_trunc('day', now() at time zone 'Europe/Bratislava') at time zone 'Europe/Bratislava'), 0)::int as day,
        coalesce(sum(amount_cents - refunded_cents) filter (where paid_at >= now() - interval '7 days'), 0)::int as week,
        coalesce(sum(amount_cents - refunded_cents) filter (where paid_at >= now() - interval '30 days'), 0)::int as month,
        coalesce(sum(amount_cents - refunded_cents), 0)::int as total
      from payments where status in ('paid', 'partially_refunded', 'refunded')
    `,
    sql<{ blocks: number; active: number; ending: number }[]>`
      select
        coalesce(sum(w * h) filter (where status in ('in_review', 'rejected', 'active', 'grace')), 0)::int as blocks,
        count(*) filter (where status in ('active', 'grace'))::int as active,
        count(*) filter (where status = 'active' and ends_at < now() + interval '30 days')::int as ending
      from rentals
    `,
    sql<{ pending: number; overdue: number }[]>`
      select count(*)::int as pending,
             count(*) filter (where coalesce(submitted_at, created_at) < now() - make_interval(hours => ${settings.review_hours}))::int as overdue
      from content_versions where status = 'pending'
    `,
    sql<{ open: number }[]>`select count(*)::int as open from reports where status = 'open'`,
    sql<{ started: number; paid: number }[]>`
      select count(*)::int as started, count(*) filter (where paid_at is not null)::int as paid
      from rentals where created_at > now() - interval '30 days' and not is_test and not is_reserved
    `,
  ]);
  return {
    revenue: money,
    rentedPixels: rentals.blocks * grid.block * grid.block,
    totalPixels: grid.width * grid.height,
    activeRentals: rentals.active,
    pendingReview: queue.pending,
    overdueReview: queue.overdue,
    openReports: reports.open,
    endingSoon: rentals.ending,
    conversion,
  };
}

/** Counters shown in the admin menu. */
export async function menuCounts(sql: Sql): Promise<{ pending: number; reports: number }> {
  const [row] = await sql<{ pending: number; reports: number }[]>`
    select (select count(*) from content_versions where status = 'pending')::int as pending,
           (select count(*) from reports where status = 'open')::int as reports
  `;
  return row;
}
