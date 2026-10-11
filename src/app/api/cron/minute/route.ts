import { db } from "@/lib/db";
import { pruneOldRows, refundMissedReuploads } from "@/lib/moderation/jobs";
import { expireStaleOrders } from "@/lib/orders/holds";
import { runLifecycle } from "@/lib/orders/lifecycle";
import { isAuthorizedInternal, revalidateWall } from "@/lib/revalidate";
import { loadSettings } from "@/lib/settings/load";
import { renderWall } from "@/lib/wall/render";

/**
 * Every minute (Vercel Cron in production, the dev and desktop scripts
 * locally): release reservations that ran out, refund rejected orders whose
 * re-upload time is over, handle the end of rentals (reminders, grace
 * period, release) and redraw the wall if anything changed.
 */
export async function GET(request: Request) {
  if (!isAuthorizedInternal(request)) return new Response("Unauthorized", { status: 401 });
  const sql = db();
  const expired = await expireStaleOrders(sql);
  const refunded = await refundMissedReuploads(sql);
  const lifecycle = await runLifecycle(sql, await loadSettings(sql));
  // Housekeeping a few times an hour is plenty.
  if (new Date().getUTCMinutes() % 15 === 0) await pruneOldRows(sql);
  const rendered = await renderWall(sql);
  if (expired || refunded || lifecycle.graced || lifecycle.ended || rendered) revalidateWall();
  return Response.json({ expired, refunded, ...lifecycle, rendered: rendered?.version ?? null }, { headers: { "Cache-Control": "no-store" } });
}
