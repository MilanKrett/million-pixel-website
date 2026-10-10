import type { Sql } from "@/lib/db";

/**
 * Approve paid content: it becomes the rental's visible content and the rental
 * period starts now (the spec: the period runs from approval, not payment).
 * The wall image is redrawn by the caller after commit.
 */
export async function approveRental(
  sql: Sql,
  rentalId: string,
  actor: { id: string | null; label: string },
): Promise<{ ok: true; endsAt: Date } | { ok: false; reason: "not_found" | "not_in_review" | "no_content" }> {
  return sql.begin(async (tx) => {
    const [rental] = await tx<{ status: string; period_years: number | null; active_content_id: string | null }[]>`
      select status, period_years, active_content_id from rentals where id = ${rentalId} for update
    `;
    if (!rental) return { ok: false, reason: "not_found" } as const;
    if (rental.status !== "in_review") return { ok: false, reason: "not_in_review" } as const;
    const [content] = await tx<{ id: string }[]>`
      select id from content_versions
      where rental_id = ${rentalId} and status = 'pending' order by created_at desc limit 1
    `;
    if (!content) return { ok: false, reason: "no_content" } as const;

    await tx`
      update content_versions set status = 'superseded'
      where rental_id = ${rentalId} and status = 'approved'
    `;
    await tx`
      update content_versions set status = 'approved', decided_at = now(), moderator_id = ${actor.id}
      where id = ${content.id}
    `;
    const [{ ends_at }] = await tx<{ ends_at: Date }[]>`
      update rentals
      set status = 'active', active_content_id = ${content.id}, starts_at = now(),
          ends_at = now() + make_interval(years => ${rental.period_years ?? 1})
      where id = ${rentalId}
      returning ends_at
    `;
    await tx`
      insert into audit_log (actor_id, action, target, details)
      values (${actor.id}, 'content.approved', ${`rental:${rentalId}`}, ${tx.json({ content: content.id, by: actor.label })})
    `;
    return { ok: true, endsAt: ends_at } as const;
  });
}
