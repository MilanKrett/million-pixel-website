import { getWallStats } from "@/lib/data";

/** Counters shown in the header. Cached for 30 s. */
export async function GET() {
  const stats = await getWallStats();
  return Response.json(stats, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
  });
}
