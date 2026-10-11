import type { NextRequest } from "next/server";
import { setRole } from "@/lib/admin/manage";
import { requireStaffApi } from "@/lib/auth/current";
import { resetTotp } from "@/lib/auth/mfa";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { runLifecycle } from "@/lib/orders/lifecycle";
import { revalidateWall } from "@/lib/revalidate";
import { loadSettings } from "@/lib/settings/load";
import { renderWall } from "@/lib/wall/render";

/**
 * Admin tools:
 *   {action: "render"}                    rebuild the whole wall image
 *   {action: "lifecycle"}                 reminders, grace period and release now (normally every minute)
 *   {action: "role", email, role}         make someone a moderator/admin, or a normal user again
 *   {action: "resetMfa", userId}          lost phone: set up two-factor login again
 */
export async function POST(request: NextRequest) {
  const auth = await requireStaffApi(request, "admin");
  if ("error" in auth) return auth.error;
  const actor = { id: auth.session.user.id, label: auth.session.user.email };
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sql = db();

  if (body?.action === "render") {
    const result = await renderWall(sql, { full: true });
    revalidateWall();
    await sql`insert into audit_log (actor_id, action, target, details) values (${actor.id}, 'wall.rebuilt', 'wall', ${sql.json({ version: result?.version ?? null, by: actor.label })})`;
    return noStoreJson({ ok: true, version: result?.version ?? null, ms: result?.ms ?? null });
  }
  if (body?.action === "lifecycle") {
    const result = await runLifecycle(sql, await loadSettings(sql));
    await renderWall(sql);
    revalidateWall();
    await sql`insert into audit_log (actor_id, action, target, details) values (${actor.id}, 'jobs.lifecycle', 'rentals', ${sql.json({ ...result, by: actor.label })})`;
    return noStoreJson({ ok: true, ...result });
  }
  if (body?.action === "role") {
    const role = body.role === "admin" || body.role === "moderator" || body.role === "user" ? body.role : null;
    if (!role) return jsonError(400, "invalid");
    const result = await setRole(sql, body.email, role, actor);
    if (!result.ok) return jsonError(409, result.reason);
    return noStoreJson({ ok: true });
  }
  if (body?.action === "resetMfa" && typeof body.userId === "string" && /^[0-9a-f-]{36}$/i.test(body.userId)) {
    await resetTotp(sql, body.userId);
    await sql`insert into audit_log (actor_id, action, target, details) values (${actor.id}, 'mfa.reset', ${`user:${body.userId}`}, ${sql.json({ by: actor.label })})`;
    return noStoreJson({ ok: true });
  }
  return jsonError(400, "invalid");
}
