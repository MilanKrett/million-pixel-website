import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { readOrderCookie } from "@/lib/http";
import { findOrder } from "@/lib/orders/order";
import { storage } from "@/lib/storage";

/**
 * A content PNG that is not public yet (draft or waiting for approval). Only
 * the browser that owns the order, or the admin, may see it.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/rentals/[id]/content/[contentId]">) {
  const { id, contentId } = await ctx.params;
  const admin = isAdminRequest(request);
  if (!admin) {
    const cookie = readOrderCookie(request);
    if (!cookie || cookie.id !== id || !(await findOrder(db(), id, cookie.token))) {
      return new Response("Not found", { status: 404 });
    }
  }
  const [content] = await db()<{ png_path: string | null }[]>`
    select png_path from content_versions where id = ${contentId} and rental_id = ${id}
  `;
  const file = content?.png_path ? await storage().get("content", content.png_path) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
