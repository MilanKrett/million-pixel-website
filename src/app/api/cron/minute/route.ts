import { db } from "@/lib/db";
import { expireStaleOrders } from "@/lib/orders/holds";
import { isAuthorizedInternal, revalidateWall } from "@/lib/revalidate";
import { renderWall } from "@/lib/wall/render";

/**
 * Every minute (Vercel Cron in production, the dev script locally): release
 * reservations that ran out and redraw the wall if anything changed.
 */
export async function GET(request: Request) {
  if (!isAuthorizedInternal(request)) return new Response("Unauthorized", { status: 401 });
  const expired = await expireStaleOrders(db());
  const rendered = await renderWall(db());
  if (expired || rendered) revalidateWall();
  return Response.json({ expired, rendered: rendered?.version ?? null }, { headers: { "Cache-Control": "no-store" } });
}
