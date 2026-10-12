import sharp from "sharp";
import type { Sql } from "@/lib/db";
import type { Rect } from "@/lib/geometry";
import { drawText, LINE_HEIGHT, textWidth, wrapText } from "@/lib/pixel-font";
import { wallGrid, type Settings } from "@/lib/settings/schema";
import { storage } from "@/lib/storage";
import { EMPTY_COLOR, Raster, type Rgb } from "@/lib/wall/raster";
import { wallImagePath } from "@/lib/wall/render";

/**
 * Pictures for social networks (Open Graph, 1200 × 630): the whole wall for
 * the home page and a close-up of one place for its share page. Texts are
 * drawn with the site's own pixel font, so no system fonts are needed on the
 * server and every site language works.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const WHITE: Rgb = [0xff, 0xff, 0xff];
const BLACK: Rgb = [0x00, 0x00, 0x00];
const GREY: Rgb = [0x55, 0x55, 0x55];
const BORDER: Rgb = [0xcc, 0xcc, 0xcc];
const ACCENT: Rgb = [0xe8, 0x59, 0x0c];

// The 4 × 4 logo next to the site name (components/site/LogoMark.tsx).
const LOGO: Rgb[] = [
  [0xe8, 0x59, 0x0c], [0xf4, 0xf4, 0xf4], [0x19, 0x71, 0xc2], [0x2f, 0x9e, 0x44],
  [0xf4, 0xf4, 0xf4], [0xf5, 0x9f, 0x00], [0xe8, 0x59, 0x0c], [0xf4, 0xf4, 0xf4],
  [0x70, 0x48, 0xe8], [0xe8, 0x59, 0x0c], [0xf4, 0xf4, 0xf4], [0x19, 0x71, 0xc2],
  [0x2f, 0x9e, 0x44], [0xf4, 0xf4, 0xf4], [0xf5, 0x9f, 0x00], [0xe8, 0x59, 0x0c],
];

/** The newest wall picture, or an empty wall. */
async function currentWall(sql: Sql, settings: Settings): Promise<Raster> {
  const grid = wallGrid(settings);
  const [latest] = await sql<{ id: number }[]>`select id from wall_versions where image_path <> '' order by id desc limit 1`;
  if (latest) {
    const file = await storage().get("wall", wallImagePath(latest.id, "png"));
    if (file) {
      try {
        const raster = await Raster.decode(file);
        if (raster.width === grid.width && raster.height === grid.height) return raster;
      } catch {
        // A damaged file: fall back to an empty wall.
      }
    }
  }
  return Raster.filled(grid.width, grid.height, EMPTY_COLOR);
}

function outline(r: Raster, x: number, y: number, w: number, h: number, color: Rgb, thickness = 1) {
  r.fill(x, y, w, thickness, color);
  r.fill(x, y + h - thickness, w, thickness, color);
  r.fill(x, y, thickness, h, color);
  r.fill(x + w - thickness, y, thickness, h, color);
}

/** Text in the pixel font; returns the y below the last line. */
function writeLines(r: Raster, text: string, x: number, y: number, maxWidth: number, scale: number, color: Rgb, maxLines = 3): number {
  const { lines } = wrapText(text, Math.floor(maxWidth / scale), Number.MAX_SAFE_INTEGER);
  let cy = y;
  for (const line of lines.slice(0, maxLines)) {
    drawText(line, x, cy, (px, py) => r.setPixel(px, py, color), scale);
    cy += LINE_HEIGHT * scale;
  }
  return cy;
}

/** One line, centred, at the largest of `scales` that fits; shortened with "…" if none does. */
function writeCentred(r: Raster, text: string, cy: number, maxWidth: number, scales: number[], color: Rgb) {
  let line = text;
  const scale = scales.find((s) => textWidth(text) * s <= maxWidth) ?? scales[scales.length - 1]!;
  const fits = (s: string) => textWidth(s) * scale <= maxWidth;
  if (!fits(line)) {
    const chars = [...line];
    while (chars.length > 1 && !fits(`${chars.join("")}…`)) chars.pop();
    line = `${chars.join("")}…`;
  }
  const x = Math.round((r.width - textWidth(line) * scale) / 2);
  drawText(line, x, cy, (px, py) => r.setPixel(px, py, color), scale);
}

/**
 * Home page: the wall on the left, the site name and the price on the right.
 * `lines` are already translated ("1,000,000 pixels", "10 cents per pixel", the slogan, "12 % sold").
 */
export async function wallOgImage(sql: Sql, settings: Settings, name: string, lines: string[], footer: string): Promise<Buffer> {
  const canvas = Raster.filled(OG_WIDTH, OG_HEIGHT, WHITE);
  const wall = await currentWall(sql, settings);
  const size = 570;
  const scaled = await sharp(wall.data, { raw: { width: wall.width, height: wall.height, channels: 3 } })
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  canvas.blit(new Raster(size, size, scaled), 30, 30);
  outline(canvas, 29, 29, size + 2, size + 2, BORDER);

  const left = 640;
  const width = OG_WIDTH - left - 40;
  LOGO.forEach((color, i) => canvas.fill(left + (i % 4) * 16, 40 + Math.floor(i / 4) * 16, 16, 16, color));
  outline(canvas, left, 40, 64, 64, BORDER);
  let y = writeLines(canvas, name, left, 136, width, 5, BLACK, 2) + 18;
  for (const line of lines) y = writeLines(canvas, line, left, y, width, 3, GREY, 2) + 8;
  writeLines(canvas, footer, left, OG_HEIGHT - 70, width, 3, ACCENT, 1);
  return canvas.encodePng();
}

/**
 * Share page of a place: the wall around it, enlarged with sharp pixels and
 * the place outlined, and a line of text below.
 */
export async function spotOgImage(sql: Sql, settings: Settings, rect: Rect, text: string, title: string): Promise<Buffer> {
  const canvas = Raster.filled(OG_WIDTH, OG_HEIGHT, WHITE);
  const wall = await currentWall(sql, settings);
  const block = settings.block_size_px;
  const viewW = OG_WIDTH;
  const viewH = 470;
  const rx = rect.x * block;
  const ry = rect.y * block;
  const rw = rect.w * block;
  const rh = rect.h * block;
  // Enlarge so the place takes about 40 % of the picture; whole steps keep pixels square.
  const fit = Math.min(viewW / (rw * 2.5), viewH / (rh * 2.5));
  const scale = fit >= 1 ? Math.min(16, Math.floor(fit)) : fit;
  const srcW = viewW / scale;
  const srcH = viewH / scale;
  // Centred on the place, but kept inside the wall where the wall is big enough.
  const clamp = (v: number, size: number, total: number) => (size >= total ? (total - size) / 2 : Math.min(Math.max(v, 0), total - size));
  const sx0 = clamp(rx + rw / 2 - srcW / 2, srcW, wall.width);
  const sy0 = clamp(ry + rh / 2 - srcH / 2, srcH, wall.height);
  for (let ty = 0; ty < viewH; ty++) {
    const sy = Math.floor(sy0 + ty / scale);
    for (let tx = 0; tx < viewW; tx++) {
      const sx = Math.floor(sx0 + tx / scale);
      const inside = sx >= 0 && sy >= 0 && sx < wall.width && sy < wall.height;
      canvas.setPixel(tx, ty, inside ? wall.getPixel(sx, sy) : WHITE);
    }
  }
  const fx = Math.round((rx - sx0) * scale);
  const fy = Math.round((ry - sy0) * scale);
  outline(canvas, fx - 4, fy - 4, Math.round(rw * scale) + 8, Math.round(rh * scale) + 8, ACCENT, 4);
  canvas.fill(0, viewH, OG_WIDTH, 1, BORDER);
  writeCentred(canvas, text, viewH + 28, OG_WIDTH - 80, [5, 4, 3], BLACK);
  writeCentred(canvas, title, viewH + 28 + LINE_HEIGHT * 5 + 14, OG_WIDTH - 80, [3, 2], GREY);
  return canvas.encodePng();
}
