import type { Sql } from "@/lib/db";
import { isOwnerEditable, validateTexts, type ContentTexts, type DetailsErrors } from "@/lib/orders/order";

/**
 * Sending a change for review from My pixels (or by an admin on the
 * renter's behalf). The change is a new content version: either a draft made
 * in the editor, or — when only the title, link or name change — a copy of
 * the current version that shares its picture files.
 */

export type SubmitResult =
  | { ok: true; contentId: string }
  | { ok: false; reason: "not_found" | "not_editable" | "no_content" | "draft_missing" | "unchanged" }
  | { ok: false; reason: "invalid"; errors: Pick<DetailsErrors, "title" | "url" | "displayName"> };

export async function submitContentChange(
  sql: Sql,
  rentalId: string,
  input: { contentId: unknown; title: unknown; url: unknown; displayName: unknown },
  actor: { id: string | null; label: string },
): Promise<SubmitResult> {
  const validated = validateTexts(input);
  if (!validated.ok) return { ok: false, reason: "invalid", errors: validated.errors };
  const texts: ContentTexts = validated.texts;
  const draftId = typeof input.contentId === "string" && /^[0-9a-f-]{36}$/i.test(input.contentId) ? input.contentId : null;

  return sql.begin(async (tx): Promise<SubmitResult> => {
    const [rental] = await tx<{ id: string; status: string; reupload_until: Date | null; active_content_id: string | null }[]>`
      select id, status, reupload_until, active_content_id from rentals where id = ${rentalId} for update
    `;
    if (!rental) return { ok: false, reason: "not_found" };
    if (!isOwnerEditable(rental)) return { ok: false, reason: "not_editable" };

    let contentId: string;
    if (draftId) {
      const [draft] = await tx<{ id: string }[]>`
        update content_versions
        set status = 'pending', title = ${texts.title}, url = ${texts.url}, display_name = ${texts.displayName}, submitted_at = now()
        where id = ${draftId} and rental_id = ${rentalId} and status = 'draft'
        returning id
      `;
      if (!draft) return { ok: false, reason: "draft_missing" };
      contentId = draft.id;
    } else {
      // Texts only: start from the version waiting for review, else the one on the wall,
      // else (rejected new rental) the last version that was not approved.
      const [base] = await tx<{ kind: string; png_path: string | null; source_path: string | null; params: unknown; title: string | null; url: string | null; display_name: string | null }[]>`
        select kind, png_path, source_path, params, title, url, display_name from content_versions
        where rental_id = ${rentalId}
          and (status = 'pending' or id = ${rental.active_content_id ?? null}
               or (${rental.status === "rejected"} and status in ('rejected', 'changes_requested')))
          and blocked_at is null
        order by (status = 'pending') desc, (id = ${rental.active_content_id ?? null}) desc, created_at desc
        limit 1
      `;
      if (!base?.png_path) return { ok: false, reason: "no_content" };
      if (base.title === texts.title && base.url === texts.url && base.display_name === texts.displayName) {
        return { ok: false, reason: "unchanged" };
      }
      const [created] = await tx<{ id: string }[]>`
        insert into content_versions (rental_id, kind, source_path, png_path, title, url, display_name, status, params, submitted_at)
        values (${rentalId}, ${base.kind}, ${base.source_path}, ${base.png_path}, ${texts.title}, ${texts.url}, ${texts.displayName},
                'pending', ${tx.json(base.params as never)}, now())
        returning id
      `;
      contentId = created.id;
    }

    // Only the newest change waits for review.
    await tx`
      update content_versions set status = 'superseded'
      where rental_id = ${rentalId} and status = 'pending' and id <> ${contentId}
    `;
    if (rental.status === "rejected") {
      await tx`update rentals set status = 'in_review', reupload_until = null where id = ${rentalId}`;
    }
    await tx`
      insert into audit_log (actor_id, action, target, details)
      values (${actor.id}, 'content.submitted', ${`rental:${rentalId}`}, ${tx.json({ content: contentId, by: actor.label })})
    `;
    return { ok: true, contentId };
  });
}
