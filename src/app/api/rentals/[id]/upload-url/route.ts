import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { authorizeOrder } from "@/lib/orders/request";
import { loadSettings } from "@/lib/settings/load";
import { storage } from "@/lib/storage";

const TYPES: Record<string, "png" | "jpeg" | "webp" | "gif"> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Permission to upload one original picture straight to storage (step 3, "Upload"). */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/rentals/[id]/upload-url">) {
  const { id } = await ctx.params;
  const auth = await authorizeOrder(request, id, { mutate: true, editable: true });
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { contentType?: string; size?: number };
  const settings = await loadSettings(db());
  const maxBytes = Math.round(settings.upload_max_mb * 1024 * 1024);
  const format = body.contentType ? TYPES[body.contentType] : undefined;
  if (!format || !settings.upload_formats.includes(format)) return jsonError(415, "unsupported_format");
  if (!Number.isFinite(body.size) || (body.size ?? 0) <= 0) return jsonError(400, "invalid");
  if ((body.size ?? 0) > maxBytes) return jsonError(413, "too_large");

  const path = `uploads/${id}/${randomUUID()}`;
  const upload = await storage().createUploadUrl("content", path, { contentType: body.contentType!, maxBytes });
  return noStoreJson({ path, upload });
}
