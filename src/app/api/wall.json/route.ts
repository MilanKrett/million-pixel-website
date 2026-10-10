import { getWallSnapshot } from "@/lib/data";

/** All active rentals in a compact form (see WallSnapshot). Cached for 30 s. */
export async function GET() {
  const snapshot = await getWallSnapshot();
  return Response.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" },
  });
}
