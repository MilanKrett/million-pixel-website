import { db } from "@/lib/db";
import { recheckActiveLinks } from "@/lib/moderation/checks";
import { runLifecycle } from "@/lib/orders/lifecycle";
import { isAuthorizedInternal, revalidateWall } from "@/lib/revalidate";
import { loadSettings } from "@/lib/settings/load";
import { pruneWallVersions, renderWall } from "@/lib/wall/render";

/**
 * Once a day: the end-of-rental jobs (also run every minute; this is the
 * safety net), a check of every link on the wall (a page can turn dangerous
 * after approval), a full rebuild of the wall image from all pictures,
 * which repairs anything the quick partial redraws might have missed, and
 * removal of old wall images.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedInternal(request)) return new Response("Unauthorized", { status: 401 });
  const sql = db();
  const lifecycle = await runLifecycle(sql, await loadSettings(sql));
  const links = await recheckActiveLinks(sql);
  const rendered = await renderWall(sql, { full: true });
  revalidateWall();
  const pruned = await pruneWallVersions(sql);
  return Response.json({ ...lifecycle, links, rendered: rendered?.version ?? null, pruned }, { headers: { "Cache-Control": "no-store" } });
}
