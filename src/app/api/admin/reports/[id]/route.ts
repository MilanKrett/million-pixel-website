import type { NextRequest } from "next/server";
import { refreshWall } from "@/lib/admin/after-decision";
import { requireStaffApi } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { isReasonCode } from "@/lib/email/reasons";
import { jsonError, noStoreJson } from "@/lib/http";
import { decideReport } from "@/lib/moderation/reports";

/** A moderator's decision on a report: {decision: dismiss | hide | remove, reasonCode, note, unhide}. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/reports/[id]">) {
  const auth = await requireStaffApi(request, "moderator");
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "not_found");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const decision = body?.decision;
  if (decision !== "dismiss" && decision !== "hide" && decision !== "remove") return jsonError(400, "invalid");
  const reasonCode = isReasonCode(body?.reasonCode) ? body.reasonCode : decision === "dismiss" ? "other" : null;
  if (!reasonCode) return jsonError(400, "reason_required");
  const result = await decideReport(db(), id, { id: auth.session.user.id, label: auth.session.user.email }, {
    decision,
    reasonCode,
    note: typeof body?.note === "string" ? body.note : null,
    unhide: body?.unhide === true,
  });
  if (!result.ok) return jsonError(409, result.reason);
  if (result.wallChanged) await refreshWall();
  return noStoreJson({ ok: true });
}
