import type { NextRequest } from "next/server";
import { exportCsv } from "@/lib/admin/manage";
import { requireStaffApi } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";

/** CSV export for accounting and backups: ?kind=rentals | payments. */
export async function GET(request: NextRequest) {
  const auth = await requireStaffApi(request, "admin", { mutate: false });
  if ("error" in auth) return auth.error;
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "rentals" && kind !== "payments") return jsonError(400, "invalid");
  const csv = await exportCsv(db(), kind);
  await db()`insert into audit_log (actor_id, action, target) values (${auth.session.user.id}, 'export.csv', ${kind})`;
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
