import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { loadSettings } from "@/lib/settings/load";
import type { Settings } from "@/lib/settings/schema";
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
