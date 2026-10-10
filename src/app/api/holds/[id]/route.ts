import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError, noStoreJson, readOrderCookie } from "@/lib/http";
import { releaseHold } from "@/lib/orders/holds";
import { findOrder } from "@/lib/orders/order";
import { revalidateWall } from "@/lib/revalidate";

/** Give up a reservation ("Change place" or leaving the order). */
export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/holds/[id]">) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  const { id } = await ctx.params;
  const cookie = readOrderCookie(request);
  if (!cookie || cookie.id !== id) return jsonError(404, "not_found");
  const rental = await findOrder(db(), id, cookie.token);
  if (!rental) return jsonError(404, "not_found");
  const released = await releaseHold(db(), id);
  if (released) revalidateWall();
  return noStoreJson({ released });
}
