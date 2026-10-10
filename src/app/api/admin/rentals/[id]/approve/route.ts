import { after, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { isSameOrigin } from "@/lib/http";
import { approveRental } from "@/lib/orders/approve";
import { notifyApproved } from "@/lib/orders/notify";
import { revalidateWall } from "@/lib/revalidate";
import { renderWall } from "@/lib/wall/render";

/** Temporary one-click approval (phase 2). Phase 3 replaces it with the moderation queue. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/rentals/[id]/approve">) {
  if (!isAdminRequest(request)) return new Response("Unauthorized", { status: 401 });
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const result = await approveRental(db(), id, { id: null, label: "admin (phase 2 password)" });
  const back = new URL("/admin", request.url);
  if (!result.ok) {
    back.searchParams.set("error", result.reason);
    return Response.redirect(back, 303);
  }
  // Draw the new content into the wall image now, so it is visible within seconds.
  await renderWall(db());
  revalidateWall();
  after(() => notifyApproved(db(), id));
  back.searchParams.set("approved", id);
  return Response.redirect(back, 303);
}
