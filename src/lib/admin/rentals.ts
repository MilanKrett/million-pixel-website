import type { Sql } from "@/lib/db";

/** Admin search: e-mail, title, link domain, "#123" (rental number) or "x,y" pixel coordinates. */
export interface RentalRow {
  id: string;
  no: number;
  rect: { x: number; y: number; w: number; h: number };
  status: string;
  hidden: boolean;
  isReserved: boolean;
  isTest: boolean;
  email: string | null;
  title: string | null;
  url: string | null;
  endsAt: Date | null;
  paidAt: Date | null;
}

export async function searchRentals(sql: Sql, query: string, block: number, limit = 100): Promise<RentalRow[]> {
  const q = query.trim();
  const number = q.match(/^#?(\d+)$/);
  const coords = q.match(/^(\d+)\s*[,;x ]\s*(\d+)$/i);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await sql<
    { id: string; no: number; x: number; y: number; w: number; h: number; status: string; hidden_at: Date | null; is_reserved: boolean; is_test: boolean; email: string | null; title: string | null; url: string | null; ends_at: Date | null; paid_at: Date | null }[]
  >`
    select r.id, r.no, r.x, r.y, r.w, r.h, r.status, r.hidden_at, r.is_reserved, r.is_test, r.email, r.ends_at, r.paid_at,
           c.title, c.url
    from rentals r
    left join lateral (
      select title, url from content_versions
      where rental_id = r.id and (id = r.active_content_id or r.active_content_id is null) and title is not null
      order by (id = r.active_content_id) desc nulls last, created_at desc limit 1
    ) c on true
    where r.status not in ('hold', 'awaiting_payment', 'expired')
      and (
        ${q === ""}
        or (${number !== null} and r.no = ${number ? Number(number[1]) : 0})
        or (${coords !== null} and ${coords ? Math.floor(Number(coords[1]) / block) : -1} between r.x and r.x + r.w - 1
                               and ${coords ? Math.floor(Number(coords[2]) / block) : -1} between r.y and r.y + r.h - 1)
        or (${number === null && coords === null} and (r.email ilike ${like} or c.title ilike ${like} or c.url ilike ${like}))
      )
    order by r.no desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    no: r.no,
    rect: { x: r.x, y: r.y, w: r.w, h: r.h },
    status: r.status,
    hidden: r.hidden_at !== null,
    isReserved: r.is_reserved,
    isTest: r.is_test,
    email: r.email,
    title: r.title,
    url: r.url,
    endsAt: r.ends_at,
    paidAt: r.paid_at,
  }));
}

export interface RentalDetail {
  rental: {
    id: string; no: number; x: number; y: number; w: number; h: number; status: string; email: string | null; locale: string;
    starts_at: Date | null; ends_at: Date | null; paid_at: Date | null; price_cents: number | null;
    hidden_at: Date | null; hidden_reason: string | null; is_reserved: boolean; is_test: boolean; reupload_until: Date | null;
    active_content_id: string | null; created_at: Date; user_id: string | null;
  };
  contents: { id: string; kind: string; status: string; title: string | null; url: string | null; display_name: string | null; reason_code: string | null; reason: string | null; created_at: Date; decided_at: Date | null; blocked_at: Date | null; link_flagged_at: Date | null }[];
  payments: { id: string; kind: string; status: string; amount_cents: number; refunded_cents: number; invoice_number: string | null; paid_at: Date | null; provider: string; created_at: Date }[];
  reports: { id: string; category: string; status: string; description: string | null; created_at: Date; source: string }[];
  emails: { id: number; template: string; to_email: string; subject: string; status: string; created_at: Date }[];
  audit: { id: number; action: string; details: Record<string, unknown>; created_at: Date; actor: string | null }[];
}

export async function rentalDetail(sql: Sql, no: number): Promise<RentalDetail | null> {
  const [rental] = await sql<RentalDetail["rental"][]>`
    select id, no, x, y, w, h, status, email, locale, starts_at, ends_at, paid_at, price_cents, hidden_at, hidden_reason,
           is_reserved, is_test, reupload_until, active_content_id, created_at, user_id
    from rentals where no = ${no}
  `;
  if (!rental) return null;
  const [contents, payments, reports, emails, audit] = await Promise.all([
    sql<RentalDetail["contents"]>`
      select id, kind, status, title, url, display_name, reason_code, reason, created_at, decided_at, blocked_at, link_flagged_at
      from content_versions where rental_id = ${rental.id} and status <> 'draft' order by created_at desc
    `,
    sql<RentalDetail["payments"]>`
      select id, kind, status, amount_cents, refunded_cents, invoice_number, paid_at, provider, created_at
      from payments where rental_id = ${rental.id} order by created_at desc
    `,
    sql<RentalDetail["reports"]>`
      select id, category, status, description, created_at, source from reports where rental_id = ${rental.id} order by created_at desc
    `,
    sql<RentalDetail["emails"]>`
      select id, template, to_email, subject, status, created_at from email_log where rental_id = ${rental.id} order by id desc limit 50
    `,
    sql<RentalDetail["audit"]>`
      select a.id, a.action, a.details, a.created_at, u.email as actor
      from audit_log a left join users u on u.id = a.actor_id
      where a.target = ${`rental:${rental.id}`} order by a.id desc limit 100
    `,
  ]);
  return { rental, contents, payments, reports, emails, audit };
}
