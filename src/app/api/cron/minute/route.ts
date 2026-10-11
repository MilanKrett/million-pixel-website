import { db } from "@/lib/db";
import { pruneOldRows, refundMissedReuploads } from "@/lib/moderation/jobs";
import { expireStaleOrders } from "@/lib/orders/holds";
import { releaseEndedReservations } from "@/lib/orders/lifecycle";
import { isAuthorizedInternal, revalidateWall } from "@/lib/revalidate";
import { renderWall } from "@/lib/wall/render";

/**
 * Every minute (Vercel Cron in production, the dev and desktop scripts
 * locally): release reservations that ran out, refund rejected orders whose
 * re-upload time is over, free reserved places whose end date passed and
 * redraw the wall if anything changed.
 */
export async function GET(request: Request) {
  if (!isAuthorizedInternal(request)) return new Response("Unauthorized", { status: 401 });
  const sql = db();
  const expired = await expireStaleOrders(sql);
  const refunded = await refundMissedReuploads(sql);
  const released = await releaseEndedReservations(sql);
  // Housekeeping a few times an hour is plenty.
  if (new Date().getUTCMinutes() % 15 === 0) await pruneOldRows(sql);
  const rendered = await renderWall(sql);
  if (expired || refunded || released || rendered) revalidateWall();
  return Response.json({ expired, refunded, released, rendered: rendered?.version ?? null }, { headers: { "Cache-Control": "no-store" } });
}
