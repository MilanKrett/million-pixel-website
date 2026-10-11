import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { authorizeRental } from "@/lib/orders/request";
import { storage } from "@/lib/storage";

/**
 * A content PNG of a rental (draft, waiting for approval, or any earlier
 * version). Only the browser ordering it, the owner's account and staff may
 * see it. Content blocked as illegal is never served to anyone.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/rentals/[id]/content/[contentId]">) {
  const { id, contentId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(contentId)) return new Response("Not found", { status: 404 });
  const auth = await authorizeRental(request, id, { staff: true });
  if ("error" in auth) return new Response("Not found", { status: 404 });

  const [content] = await db()<{ png_path: string | null; blocked_at: Date | null }[]>`
    select png_path, blocked_at from content_versions where id = ${contentId} and rental_id = ${id}
  `;
  if (content?.blocked_at) return new Response("Gone", { status: 410 });
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
