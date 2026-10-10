import { drawText, GLYPH_HEIGHT, LINE_HEIGHT, textWidth, wrapText } from "@/lib/pixel-font";

/**
 * "Colour + text" content: a background colour with text in the 5 × 7 pixel
 * font. The same code renders the browser preview and the final PNG on the
 * server, so what people see is exactly what they get.
 */

export type TextAlign = "left" | "center" | "right";

export interface TextTileParams {
  background: string;
  color: string;
  text: string;
  align: TextAlign;
  /** 0 = automatic (the largest size that fits). */
  scale: number;
}

export const MAX_TEXT_LENGTH = 500;
export const MAX_TEXT_SCALE = 12;

export interface TextLayout {
  scale: number;
  lines: string[];
  /** Top-left corner of every line, in pixels. */
  positions: { x: number; y: number }[];
  fits: boolean;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function parseHexColor(value: string): [number, number, number] {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Inner margin: one pixel per scale step, none for the smallest tiles. */
function padding(width: number, height: number, scale: number): number {
  return Math.min(width, height) >= 10 ? scale : 0;
}

function tryLayout(text: string, width: number, height: number, scale: number, align: TextAlign): TextLayout {
  const pad = padding(width, height, scale);
  const innerW = Math.floor((width - 2 * pad) / scale);
  const innerH = Math.floor((height - 2 * pad) / scale);
  const { lines, fits } = wrapText(text, innerW, innerH);
  const blockH = lines.length > 0 ? (lines.length - 1) * LINE_HEIGHT + GLYPH_HEIGHT : 0;
  const top = Math.floor((height - blockH * scale) / 2);
  const positions = lines.map((line, i) => {
    const lw = textWidth(line) * scale;
    const x = align === "left" ? pad : align === "right" ? width - pad - lw : Math.floor((width - lw) / 2);
    return { x, y: top + i * LINE_HEIGHT * scale };
  });
  return { scale, lines, positions, fits };
}

/** Lay out text in a width × height tile (pixels). */
export function layoutText(params: Pick<TextTileParams, "text" | "align" | "scale">, width: number, height: number): TextLayout {
  const text = params.text.trim();
  if (!text) return { scale: 1, lines: [], positions: [], fits: true };
  if (params.scale > 0) return tryLayout(text, width, height, Math.min(MAX_TEXT_SCALE, params.scale), params.align);
  for (let scale = MAX_TEXT_SCALE; scale > 1; scale--) {
    if (GLYPH_HEIGHT * scale > height) continue;
    const layout = tryLayout(text, width, height, scale, params.align);
    if (layout.fits) return layout;
  }
  return tryLayout(text, width, height, 1, params.align);
}

/** Draw a text tile through a pixel callback (server raster or browser canvas). */
export function renderTextTile(
  params: TextTileParams,
  width: number,
  height: number,
  fill: (x: number, y: number, w: number, h: number, rgb: [number, number, number]) => void,
): TextLayout {
  fill(0, 0, width, height, parseHexColor(params.background));
  const layout = layoutText(params, width, height);
  const ink = parseHexColor(params.color);
  const { scale } = layout;
  layout.lines.forEach((line, i) => {
    const p = layout.positions[i];
    drawText(line, 0, 0, (gx, gy) => {
      const x = p.x + gx * scale;
      const y = p.y + gy * scale;
      if (x >= 0 && y >= 0 && x < width && y < height) fill(x, y, scale, scale, ink);
    });
  });
  return layout;
}
