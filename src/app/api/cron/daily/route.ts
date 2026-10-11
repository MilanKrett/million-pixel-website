import { db } from "@/lib/db";
import { recheckActiveLinks } from "@/lib/moderation/checks";
import { isAuthorizedInternal } from "@/lib/revalidate";

/**
 * Once a day: check every link on the wall again (a page can turn dangerous
 * after approval). Phase 4 adds reminders, the grace period and backups.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedInternal(request)) return new Response("Unauthorized", { status: 401 });
  const links = await recheckActiveLinks(db());
  return Response.json({ links }, { headers: { "Cache-Control": "no-store" } });
}
