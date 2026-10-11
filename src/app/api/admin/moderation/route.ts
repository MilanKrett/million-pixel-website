import { after, type NextRequest } from "next/server";
import { refreshWall } from "@/lib/admin/after-decision";
import { requireStaffApi } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { isReasonCode } from "@/lib/email/reasons";
import { jsonError, noStoreJson } from "@/lib/http";
import { approveContent, rejectContent } from "@/lib/moderation/decide";
import { notifyApproved, notifyChangeApproved, notifyChangeRejected, notifyRefunded, notifyRejected } from "@/lib/orders/notify";
import { loadSettings } from "@/lib/settings/load";

/** The moderation queue's buttons: {contentId, action: approve | reject | changes, reasonCode, note, refundNow}. */
export async function POST(request: NextRequest) {
  const auth = await requireStaffApi(request, "moderator");
  if ("error" in auth) return auth.error;
  const actor = { id: auth.session.user.id, label: auth.session.user.email };
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const contentId = typeof body?.contentId === "string" && /^[0-9a-f-]{36}$/i.test(body.contentId) ? body.contentId : null;
  if (!body || !contentId) return jsonError(400, "invalid");
  const sql = db();

  if (body.action === "approve") {
    const result = await approveContent(sql, contentId, actor);
    if (!result.ok) return jsonError(409, result.reason);
    await refreshWall();
    after(() => (result.kind === "new" ? notifyApproved(db(), result.rentalId) : notifyChangeApproved(db(), result.rentalId, contentId)));
    return noStoreJson({ ok: true });
  }

  if (body.action === "reject" || body.action === "changes") {
    if (!isReasonCode(body.reasonCode)) return jsonError(400, "reason_required");
    const note = typeof body.note === "string" ? body.note : null;
    const settings = await loadSettings(sql);
    const result = await rejectContent(sql, settings, contentId, actor, {
      reasonCode: body.reasonCode,
      note,
      mode: body.action === "changes" ? "changes" : "reject",
      refundNow: body.refundNow === true,
    });
    if (!result.ok) return jsonError(409, result.reason);
    if (result.blocked || result.refunded) await refreshWall();
    const decision = { reasonCode: body.reasonCode, note };
    after(async () => {
      if (result.blocked) return;
      if (result.kind === "change") return notifyChangeRejected(db(), result.rentalId, contentId, decision);
      if (result.refunded) return notifyRefunded(db(), result.rentalId, { cause: "rejected", refundCents: result.refundedCents });
      if (result.until) {
        return notifyRejected(db(), result.rentalId, contentId, { ...decision, until: result.until, mode: body.action === "changes" ? "changes" : "rejected" });
      }
    });
    return noStoreJson({ ok: true });
  }
  return jsonError(400, "invalid");
}
