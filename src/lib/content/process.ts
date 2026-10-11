import sharp, { type Metadata, type Sharp } from "sharp";
import { Raster } from "@/lib/wall/raster";
import { applyFilter, enlarge, filterGrid, type PixelFilter } from "./pixel-filter";
import { isHexColor, MAX_TEXT_LENGTH, MAX_TEXT_SCALE, renderTextTile, type TextTileParams } from "./text-tile";

/**
 * Server-side processing of rental content. Everything a browser sends is
 * decoded, checked and re-encoded here; the result is always a PNG of exactly
 * the rented size, without any metadata (EXIF, GPS, …).
 */

export class ContentError extends Error {
  constructor(
    readonly code:
      | "unsupported_format"
      | "too_large"
      | "too_many_pixels"
      | "bad_crop"
      | "wrong_size"
      | "bad_text"
      | "unreadable",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type UploadFormat = "png" | "jpeg" | "webp" | "gif";

export interface UploadLimits {
  maxBytes: number;
  maxPx: number;
  formats: readonly UploadFormat[];
}

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

const WHITE = { r: 255, g: 255, b: 255 };
// Safety net for decompression bombs, independent of the configurable limit.
const HARD_PIXEL_LIMIT = 12_000 * 12_000;

/** What sharp detected from the file's bytes (not its name or declared type). */
export async function inspectImage(input: Buffer, limits: UploadLimits) {
  if (input.length === 0) throw new ContentError("unreadable");
  if (input.length > limits.maxBytes) throw new ContentError("too_large");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: HARD_PIXEL_LIMIT, animated: false }).metadata();
  } catch {
    throw new ContentError("unreadable");
  }
  const format: string | undefined = meta.format;
  if (!format || !limits.formats.includes(format as UploadFormat)) throw new ContentError("unsupported_format");
  if (!meta.width || !meta.height) throw new ContentError("unreadable");
  if (meta.width > limits.maxPx || meta.height > limits.maxPx) throw new ContentError("too_many_pixels");
  // EXIF orientations 5–8 swap width and height once applied.
  const rotated = (meta.orientation ?? 1) >= 5;
  return {
    format: format as UploadFormat,
    width: rotated ? meta.height : meta.width,
    height: rotated ? meta.width : meta.height,
    animated: (meta.pages ?? 1) > 1,
  };
}

/** Flatten on white and read plain RGB, checking the size. */
async function rawRgb(image: Sharp, width: number, height: number): Promise<Uint8Array> {
  const { data, info } = await image
    .flatten({ background: WHITE })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Never trust the pipeline blindly: the result must be exactly the expected size.
  if (info.width !== width || info.height !== height || info.channels !== 3) throw new ContentError("wrong_size");
  return new Uint8Array(data.buffer, data.byteOffset, data.length);
}

function encodePng(rgb: Uint8Array, width: number, height: number): Promise<Buffer> {
  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function finalPng(image: Sharp, width: number, height: number): Promise<Buffer> {
  return encodePng(await rawRgb(image, width, height), width, height);
}

/**
 * An uploaded photo through the pixel filter: orient by EXIF, cut out the
 * chosen area, scale it with Lanczos to exactly as many dots as the filter
 * asks for (the rented size ÷ pixel size), apply the filter and enlarge the
 * dots back to the rented size. Animated GIFs use their first frame. Also
 * returns the original as a clean re-encoded copy (no metadata) for moderation.
 */
export async function processUpload(
  input: Buffer,
  crop: Crop,
  target: { width: number; height: number },
  filter: PixelFilter,
  limits: UploadLimits,
): Promise<{ png: Buffer; source: Buffer; sourceExt: "png" | "jpg" | "webp"; format: UploadFormat }> {
  const info = await inspectImage(input, limits);
  const c = {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    w: Math.round(crop.w),
    h: Math.round(crop.h),
  };
  if (![c.x, c.y, c.w, c.h].every(Number.isFinite) || c.w < 1 || c.h < 1) throw new ContentError("bad_crop");
  // Clamp a crop that sticks out a little (rounding in the browser).
  c.x = Math.min(Math.max(0, c.x), info.width - 1);
  c.y = Math.min(Math.max(0, c.y), info.height - 1);
  c.w = Math.min(c.w, info.width - c.x);
  c.h = Math.min(c.h, info.height - c.y);

  const base = () => sharp(input, { limitInputPixels: HARD_PIXEL_LIMIT, animated: false }).rotate();
  const grid = filterGrid(target, filter);
  const small = base()
    .extract({ left: c.x, top: c.y, width: c.w, height: c.h })
    .resize(grid.width, grid.height, { fit: "fill", kernel: "lanczos3" });
  const dots = applyFilter(await rawRgb(small, grid.width, grid.height), grid.width, grid.height, filter);
  const png = await encodePng(enlarge(dots, grid.width, grid.height, filter.pixelSize), target.width, target.height);

  let source: Buffer;
  let sourceExt: "png" | "jpg" | "webp";
  if (info.format === "jpeg") {
    source = await base().jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    sourceExt = "jpg";
  } else if (info.format === "webp") {
    source = await base().webp({ quality: 92 }).toBuffer();
    sourceExt = "webp";
  } else {
    source = await base().png({ compressionLevel: 9 }).toBuffer();
    sourceExt = "png";
  }
  return { png, source, sourceExt, format: info.format };
}

/** A drawing from the pixel editor: must already be exactly the rented size. */
export async function processDrawing(input: Buffer, target: { width: number; height: number }): Promise<Buffer> {
  const info = await inspectImage(input, { maxBytes: 10 * 1024 * 1024, maxPx: 4000, formats: ["png"] });
  if (info.width !== target.width || info.height !== target.height) throw new ContentError("wrong_size");
  return finalPng(sharp(input, { animated: false }), target.width, target.height);
}

/** Check and normalise "Colour + text" parameters from the browser. */
export function validateTextParams(raw: unknown): TextTileParams {
  const p = (raw ?? {}) as Record<string, unknown>;
  const text = typeof p.text === "string" ? p.text.replace(/\r\n?/g, "\n") : "";
  const params: TextTileParams = {
    background: typeof p.background === "string" ? p.background.toLowerCase() : "",
    color: typeof p.color === "string" ? p.color.toLowerCase() : "",
    text,
    align: p.align === "left" || p.align === "right" ? p.align : "center",
    scale: typeof p.scale === "number" && Number.isInteger(p.scale) ? p.scale : 0,
  };
  if (
    !isHexColor(params.background) ||
    !isHexColor(params.color) ||
    text.length > MAX_TEXT_LENGTH ||
    params.scale < 0 ||
    params.scale > MAX_TEXT_SCALE
  ) {
    throw new ContentError("bad_text");
  }
  return params;
}

export async function processText(params: TextTileParams, target: { width: number; height: number }): Promise<{ png: Buffer; fits: boolean }> {
  const raster = new Raster(target.width, target.height);
  const layout = renderTextTile(params, target.width, target.height, (x, y, w, h, rgb) => raster.fill(x, y, w, h, rgb));
  const png = await finalPng(
    sharp(raster.data, { raw: { width: target.width, height: target.height, channels: 3 } }),
    target.width,
    target.height,
  );
  return { png, fits: layout.fits };
}
