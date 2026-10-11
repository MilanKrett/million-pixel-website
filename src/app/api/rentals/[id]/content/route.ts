import type { NextRequest } from "next/server";
import { validateFilter } from "@/lib/content/pixel-filter";
import { ContentError, processDrawing, processText, processUpload, validateTextParams } from "@/lib/content/process";
import { db } from "@/lib/db";
import { jsonError, noStoreJson } from "@/lib/http";
import { saveDraftContent } from "@/lib/orders/order";
import { orderResponse } from "@/lib/orders/order-response";
import { authorizeRental } from "@/lib/orders/request";
import { loadSettings } from "@/lib/settings/load";
import { storage } from "@/lib/storage";

const SOURCE_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" } as const;

/**
 * Step 3: the rental's content. Every kind ends as a PNG of exactly the rented
 * size, made here on the server:
 *  - upload: JSON { kind, path, crop, filter } after a direct upload to storage
 *  - text:   JSON { kind, params }
 *  - draw:   multipart { kind, file } with the pixel editor's PNG
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/rentals/[id]/content">) {
  const { id } = await ctx.params;
  const auth = await authorizeRental(request, id, { mutate: true, editable: true, staff: true });
  if ("error" in auth) return auth.error;
  const { rental } = auth;
  const settings = await loadSettings(db());
  const target = { width: rental.w * settings.block_size_px, height: rental.h * settings.block_size_px };

  try {
    const type = request.headers.get("content-type") ?? "";
    let saved: Awaited<ReturnType<typeof saveDraftContent>>;
    let fits = true;

    if (type.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (form.get("kind") !== "draw" || !(file instanceof Blob) || file.size > 10 * 1024 * 1024) return jsonError(400, "invalid");
      const png = await processDrawing(Buffer.from(await file.arrayBuffer()), target);
      saved = await saveDraftContent(db(), id, { kind: "draw", png, params: {} });
    } else {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return jsonError(400, "invalid");

      if (body.kind === "text") {
        const params = validateTextParams(body.params);
        const result = await processText(params, target);
        fits = result.fits;
        saved = await saveDraftContent(db(), id, { kind: "text", png: result.png, params: { ...params } });
      } else if (body.kind === "upload") {
        const path = typeof body.path === "string" ? body.path : "";
        if (!path.startsWith(`uploads/${id}/`) || path.includes("..")) return jsonError(400, "invalid");
        const raw = await storage().get("content", path);
        if (!raw) return jsonError(400, "upload_missing");
        const crop = body.crop as { x: number; y: number; w: number; h: number };
        // Older pages sent only a palette size ("retro effect"): same as the retro styles.
        const legacy = [8, 16, 32].includes(Number(body.palette)) ? { style: `retro${Number(body.palette)}` } : undefined;
        const filter = validateFilter(body.filter ?? legacy, target);
        const result = await processUpload(raw, crop ?? { x: 0, y: 0, w: 0, h: 0 }, target, filter, {
          maxBytes: Math.round(settings.upload_max_mb * 1024 * 1024),
          maxPx: settings.upload_max_px,
          formats: settings.upload_formats,
        });
        saved = await saveDraftContent(db(), id, {
          kind: "upload",
          png: result.png,
          source: { data: result.source, ext: result.sourceExt, contentType: SOURCE_TYPES[result.sourceExt] },
          params: { crop, filter: { ...filter }, format: result.format },
        });
        await storage().remove("content", [path]).catch(() => {});
      } else {
        return jsonError(400, "invalid");
      }
    }

    if ("error" in saved) return jsonError(429, saved.error);
    const order = await orderResponse(db(), settings, rental);
    return noStoreJson({ order, fits });
  } catch (error) {
    if (error instanceof ContentError) return jsonError(422, error.code);
    throw error;
  }
}
