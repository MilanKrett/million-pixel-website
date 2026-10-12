import type { Sql } from "@/lib/db";

/** Everything "My pixels" shows about one rental. */
export interface MyRental {
  id: string;
  no: number;
  rect: { x: number; y: number; w: number; h: number };
  status: string;
  hidden: boolean;
  /** First day on the wall. */
  startsAt: string | null;
  reuploadUntil: string | null;
  /** On the wall (or approved). */
  current: ContentInfo | null;
  /** Waiting for review. */
  pending: ContentInfo | null;
  /** The newest version that was not approved (shown while new content is expected). */
  declined: ContentInfo | null;
  /** The last decision about a change or the first content, when it was not an approval. */
  decision: { status: "rejected" | "changes_requested"; reasonCode: string | null; note: string | null; decidedAt: string } | null;
  stats: { clicks: number; opens: number; days: { day: string; clicks: number; opens: number }[] };
  payments: { id: string; invoiceNumber: string | null; amountCents: number; refundedCents: number; status: string; paidAt: string | null; kind: string }[];
  transfer: { toEmail: string; expiresAt: string } | null;
}

export interface ContentInfo {
  id: string;
  kind: string;
  title: string | null;
  url: string | null;
  displayName: string | null;
  params: Record<string, unknown>;
  submittedAt: string | null;
}

const VISIBLE = ["in_review", "active", "grace", "ended", "rejected", "removed", "refunded"];
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function listMyRentals(sql: Sql, userId: string): Promise<MyRental[]> {
  const rentals = await sql<
    { id: string; no: number; x: number; y: number; w: number; h: number; status: string; hidden_at: Date | null; starts_at: Date | null; reupload_until: Date | null; active_content_id: string | null }[]
  >`
    select id, no, x, y, w, h, status, hidden_at, starts_at, reupload_until, active_content_id
    from rentals
    where user_id = ${userId} and status in ${sql(VISIBLE)}
    order by (status in ('in_review', 'active', 'grace', 'rejected')) desc, created_at desc
  `;
  if (!rentals.length) return [];
  const ids = rentals.map((r) => r.id);

  const [contents, stats, payments, transfers] = await Promise.all([
    sql<{ id: string; rental_id: string; kind: string; title: string | null; url: string | null; display_name: string | null; params: Record<string, unknown>; status: string; reason_code: string | null; reason: string | null; submitted_at: Date | null; decided_at: Date | null; created_at: Date }[]>`
      select id, rental_id, kind, title, url, display_name, params, status, reason_code, reason, submitted_at, decided_at, created_at
      from content_versions
      where rental_id in ${sql(ids)} and status <> 'draft' and blocked_at is null
      order by created_at desc
    `,
    sql<{ rental_id: string; day: Date; clicks: number; opens: number }[]>`
      select rental_id, day, clicks, opens from click_stats
      where rental_id in ${sql(ids)} and day > (now() at time zone 'Europe/Bratislava')::date - 30
      order by day desc
    `,
    sql<{ id: string; rental_id: string; invoice_number: string | null; amount_cents: number; refunded_cents: number; status: string; paid_at: Date | null; kind: string }[]>`
      select id, rental_id, invoice_number, amount_cents, refunded_cents, status, paid_at, kind from payments
      where rental_id in ${sql(ids)} and status in ('paid', 'refunded', 'partially_refunded')
      order by paid_at
    `,
    sql<{ rental_id: string; to_email: string; expires_at: Date }[]>`
      select rental_id, to_email, expires_at from rental_transfers
      where rental_id in ${sql(ids)} and accepted_at is null and cancelled_at is null and expires_at > now()
    `,
  ]);
  const totals = await sql<{ rental_id: string; clicks: number; opens: number }[]>`
    select rental_id, sum(clicks)::int as clicks, sum(opens)::int as opens from click_stats
    where rental_id in ${sql(ids)} group by rental_id
  `;

  const info = (c: (typeof contents)[number]): ContentInfo => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    url: c.url,
    displayName: c.display_name,
    params: c.params,
    submittedAt: iso(c.submitted_at),
  });

  return rentals.map((r) => {
    const mine = contents.filter((c) => c.rental_id === r.id);
    const current = mine.find((c) => c.id === r.active_content_id) ?? null;
    const pending = mine.find((c) => c.status === "pending") ?? null;
    // A decision newer than the content on the wall and than anything waiting.
    const lastDecided = mine.find((c) => c.status === "rejected" || c.status === "changes_requested");
    // Only a decision about something newer than what is on the wall or waiting still matters.
    const decision =
      lastDecided &&
      lastDecided.decided_at &&
      (!pending || pending.created_at < lastDecided.created_at) &&
      (!current || current.created_at < lastDecided.created_at)
        ? {
            status: lastDecided.status as "rejected" | "changes_requested",
            reasonCode: lastDecided.reason_code,
            note: lastDecided.reason,
            decidedAt: lastDecided.decided_at.toISOString(),
          }
        : null;
    const total = totals.find((t) => t.rental_id === r.id);
    const transfer = transfers.find((t) => t.rental_id === r.id);
    return {
      id: r.id,
      no: r.no,
      rect: { x: r.x, y: r.y, w: r.w, h: r.h },
      status: r.status,
      hidden: r.hidden_at !== null,
      startsAt: iso(r.starts_at),
      reuploadUntil: iso(r.reupload_until),
      current: current ? info(current) : null,
      pending: pending ? info(pending) : null,
      declined: lastDecided && (!current || current.created_at < lastDecided.created_at) ? info(lastDecided) : null,
      decision,
      stats: {
        clicks: total?.clicks ?? 0,
        opens: total?.opens ?? 0,
        days: stats
          .filter((s) => s.rental_id === r.id)
          .map((s) => ({ day: s.day.toISOString().slice(0, 10), clicks: s.clicks, opens: s.opens })),
      },
      payments: payments
        .filter((p) => p.rental_id === r.id)
        .map((p) => ({
          id: p.id,
          invoiceNumber: p.invoice_number,
          amountCents: p.amount_cents,
          refundedCents: p.refunded_cents,
          status: p.status,
          paidAt: iso(p.paid_at),
          kind: p.kind,
        })),
      transfer: transfer ? { toEmail: transfer.to_email, expiresAt: transfer.expires_at.toISOString() } : null,
    };
  });
}
