import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { suggestSpots } from "@/lib/orders/holds";
import { loadSettings } from "@/lib/settings/load";
import { wallGrid } from "@/lib/settings/schema";

/** "Find me a spot": free w × h spots (in blocks) near the centre and at random. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const w = Number(params.get("w"));
  const h = Number(params.get("h"));
  const settings = await loadSettings(db());
  const { cols, rows } = wallGrid(settings);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > cols || h > rows) {
    return jsonError(400, "invalid_size");
  }
  const spots = await suggestSpots(db(), settings, w, h);
  return noStoreJson(spots);
}
