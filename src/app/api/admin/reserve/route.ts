import type { NextRequest } from "next/server";
import { refreshWall } from "@/lib/admin/after-decision";
import { createReservedRental } from "@/lib/admin/manage";
import { requireStaffApi } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { loadSettings } from "@/lib/settings/load";

/** Reserve blocks without payment: {x, y, w, h} in blocks, endsAt ("YYYY-MM-DD" or empty = no end), note. */
export async function POST(request: NextRequest) {
  const auth = await requireStaffApi(request, "admin");
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "invalid");
  const endsAt = typeof body.endsAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.endsAt) ? new Date(`${body.endsAt}T23:59:59Z`) : null;
  const sql = db();
  const result = await createReservedRental(
    sql,
    await loadSettings(sql),
    { rect: { x: Number(body.x), y: Number(body.y), w: Number(body.w), h: Number(body.h) }, endsAt, note: typeof body.note === "string" ? body.note : null },
    { id: auth.session.user.id, label: auth.session.user.email },
  );
  if (!result.ok) return jsonError(409, result.reason, { blocks: result.blocks ?? [] });
  await refreshWall();
  return noStoreJson({ ok: true, no: result.no });
}
