import { isAuthorizedInternal, revalidateSettings } from "@/lib/revalidate";

/** Used by scripts (seed, wall render) to refresh cached wall data. Needs CRON_SECRET. */
export async function POST(request: Request) {
  if (!isAuthorizedInternal(request)) return new Response("Unauthorized", { status: 401 });
  revalidateSettings();
  return Response.json({ ok: true });
}
