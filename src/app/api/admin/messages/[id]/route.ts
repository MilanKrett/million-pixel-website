import type { NextRequest } from "next/server";
import { requireStaffApi } from "@/lib/auth/current";
import { setContactMessageDone } from "@/lib/contact";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";

/** Mark a contact message as handled or open it again: {done: boolean}. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/messages/[id]">) {
  const auth = await requireStaffApi(request, "admin");
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "not_found");
  const body = (await request.json().catch(() => null)) as { done?: unknown } | null;
  if (typeof body?.done !== "boolean") return jsonError(400, "invalid");
  if (!(await setContactMessageDone(db(), id, body.done, auth.session.user.id))) return jsonError(404, "not_found");
  return noStoreJson({ ok: true });
}
