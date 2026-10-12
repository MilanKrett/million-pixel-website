import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { loadSettings } from "@/lib/settings/load";
import type { Settings } from "@/lib/settings/schema";
import { loadLatestSpots, loadSpot, type LatestSpot } from "@/lib/wall/latest";
import { loadWallSnapshot, loadWallStats, type WallSnapshot, type WallStats } from "@/lib/wall/snapshot";

/**
 * Cached reads for pages and public API routes. Tags let admin actions and
 * the wall renderer refresh them immediately (see lib/revalidate.ts).
 */

export async function getSiteSettings(): Promise<Settings> {
  "use cache";
  cacheLife("settings");
  cacheTag("settings");
  return loadSettings(db());
}

export async function getWallSnapshot(): Promise<WallSnapshot> {
  "use cache";
  cacheLife("wall");
  cacheTag("wall");
  return loadWallSnapshot(db(), await getSiteSettings());
}

export async function getWallStats(): Promise<WallStats> {
  "use cache";
  cacheLife("wall");
  cacheTag("wall");
  return loadWallStats(db(), await getSiteSettings());
}

export async function getLatestSpots(): Promise<LatestSpot[]> {
  "use cache";
  cacheLife("wall");
  cacheTag("wall");
  return loadLatestSpots(db());
}

/** A place on the wall by its number, or null when it is not shown (share pages). */
export async function getSpot(no: number): Promise<LatestSpot | null> {
  "use cache";
  cacheLife("wall");
  cacheTag("wall");
  return loadSpot(db(), no);
}
