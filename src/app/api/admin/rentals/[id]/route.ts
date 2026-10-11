import { after, type NextRequest } from "next/server";
import { submitContentChange } from "@/lib/account/changes";
import { refreshWall } from "@/lib/admin/after-decision";
import { endReservedRental } from "@/lib/admin/manage";
import { requireStaffApi } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { isReasonCode } from "@/lib/email/reasons";
import { jsonError, noStoreJson } from "@/lib/http";
import { approveContent, extendRental, hideRental, removeRental, unhideRental } from "@/lib/moderation/decide";
import { notifyExtendedFree, notifyHidden, notifyRefunded, notifyRemoved } from "@/lib/orders/notify";
import { loadRental } from "@/lib/orders/order";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { refundRental } from "@/lib/payments/refund";

/**
 * Admin actions on a rental (admins only):
 *   hide / unhide / remove {reasonCode, note}, extend {days, notify}, refund {amount?, endRental},
 *   publish {contentId?, title, url, displayName} (change the content on the renter's behalf, approved at once),
 *   endReserved (free a reserved place),
 *   testEndsAt {endsAt} (local computer only: move the end date to try the end of a rental).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/rentals/[id]">) {
  const auth = await requireStaffApi(request, "admin");
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const sql = db();
  const rental = await loadRental(sql, id);
  if (!rental) return jsonError(404, "not_found");
  const actor = { id: auth.session.user.id, label: auth.session.user.email };
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "invalid");
  const note = typeof body.note === "string" ? body.note.slice(0, 2000) : null;

  switch (body.action) {
    case "hide": {
      if (!isReasonCode(body.reasonCode)) return jsonError(400, "reason_required");
      const decision = { reasonCode: body.reasonCode, note };
      if (!(await hideRental(sql, id, actor, decision))) return jsonError(409, "rental_state");
      await refreshWall();
      if (body.reasonCode !== "child") after(() => notifyHidden(db(), id, decision));
      return noStoreJson({ ok: true });
    }
    case "unhide": {
      if (!(await unhideRental(sql, id, actor))) return jsonError(409, "rental_state");
      await refreshWall();
      return noStoreJson({ ok: true });
    }
    case "remove": {
      if (!isReasonCode(body.reasonCode)) return jsonError(400, "reason_required");
      const decision = { reasonCode: body.reasonCode, note };
      if (!(await removeRental(sql, id, actor, decision))) return jsonError(409, "rental_state");
      await sql`
        update reports set status = 'actioned', action = 'removed', resolution = ${note}, resolved_at = now(), decided_by = ${actor.id}
        where rental_id = ${id} and status = 'open'
      `;
      await refreshWall();
      if (body.reasonCode !== "child") after(() => notifyRemoved(db(), id, decision));
      return noStoreJson({ ok: true });
    }
    case "extend": {
      const days = Number(body.days);
      const endsAt = await extendRental(sql, id, actor, days);
      if (!endsAt) return jsonError(409, "rental_state");
      await refreshWall();
      if (body.notify !== false) after(() => notifyExtendedFree(db(), id, days));
      return noStoreJson({ ok: true, endsAt });
    }
    case "testEndsAt": {
      // Never on the live site: this changes what renters paid for.
      if (!isDevPaymentsAllowed()) return jsonError(404, "not_found");
      const endsAt = typeof body.endsAt === "string" ? new Date(body.endsAt) : null;
      if (!endsAt || Number.isNaN(endsAt.getTime())) return jsonError(400, "invalid");
      const rows = await sql`
        update rentals set ends_at = greatest(${endsAt}, starts_at + interval '1 minute'),
                           status = case when status = 'grace' and ${endsAt} > now() then 'active' else status end
        where id = ${id} and status in ('active', 'grace') returning id
      `;
      if (!rows.length) return jsonError(409, "rental_state");
      // Forget earlier reminders, so they can be tried again right away.
      await sql`delete from rental_reminders where rental_id = ${id}`;
      await sql`
        insert into audit_log (actor_id, action, target, details)
        values (${actor.id}, 'rental.test_end_date', ${`rental:${id}`}, ${sql.json({ endsAt: endsAt.toISOString(), by: actor.label })})
      `;
      await refreshWall();
      return noStoreJson({ ok: true });
    }
    case "refund": {
      const amountCents = body.amount === null || body.amount === undefined || body.amount === "" ? null : Math.round(Number(body.amount) * 100);
      if (amountCents !== null && !Number.isFinite(amountCents)) return jsonError(400, "invalid_amount");
      const result = await refundRental(sql, id, { amountCents, endRental: body.endRental === true, actor, cause: "admin" });
      if (!result.ok) return jsonError(409, result.reason);
      if (body.endRental === true) await refreshWall();
      after(() => notifyRefunded(db(), id, { cause: "admin", refundCents: result.refundedCents }));
      return noStoreJson({ ok: true, refundedCents: result.refundedCents });
    }
    case "publish": {
      const submitted = await submitContentChange(sql, id, body as Parameters<typeof submitContentChange>[2], actor);
      if (!submitted.ok) {
        if (submitted.reason === "invalid") return jsonError(422, "invalid_details", { errors: submitted.errors });
        return jsonError(409, submitted.reason);
      }
      const approved = await approveContent(sql, submitted.contentId, actor);
      if (!approved.ok) return jsonError(409, approved.reason);
      await refreshWall();
      return noStoreJson({ ok: true });
    }
    case "endReserved": {
      if (!(await endReservedRental(sql, id, actor))) return jsonError(409, "rental_state");
      await refreshWall();
      return noStoreJson({ ok: true });
    }
    default:
      return jsonError(400, "invalid");
  }
}
