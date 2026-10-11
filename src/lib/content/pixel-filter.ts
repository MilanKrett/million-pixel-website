import { mapToPalette, medianCutPalette, type Rgb } from "./quantize";

/**
 * The pixel filter: turns a photo into exactly as many pixels as the renter
 * bought. The photo is first scaled down to (area ÷ pixel size) — on the
 * server with Lanczos, in the browser preview with the canvas — and then this
 * code adjusts the colours, applies the style and enlarges every dot to
 * pixel size × pixel size. The same code runs in the preview and on the
 * server, so the preview shows what will be saved.
 */

export const FILTER_STYLES = ["photo", "retro32", "retro16", "retro8", "gameboy", "bw", "gray"] as const;
export type FilterStyle = (typeof FILTER_STYLES)[number];

export interface PixelFilter {
  /** Edge of one visible pixel in real pixels: 1 = every bought pixel has its own colour. */
  pixelSize: number;
  style: FilterStyle;
  /** Floyd–Steinberg dithering for the styles with a small palette. */
  dither: boolean;
  /** −50 … 50 */
  brightness: number;
  contrast: number;
  saturation: number;
}

export const DEFAULT_FILTER: PixelFilter = { pixelSize: 1, style: "photo", dither: false, brightness: 0, contrast: 0, saturation: 0 };

const RETRO_COLOURS: Partial<Record<FilterStyle, number>> = { retro32: 32, retro16: 16, retro8: 8 };

/** The original Game Boy screen: four shades of green, darkest first. */
const GAMEBOY: Rgb[] = [
  [15, 56, 15],
  [48, 98, 48],
  [139, 172, 15],
  [155, 188, 15],
];
const BLACK_WHITE: Rgb[] = [
  [0, 0, 0],
  [255, 255, 255],
];

/** Pixel sizes that fit whole blocks (and so every rented area) exactly. */
export function pixelSizesFor(blockSize: number): number[] {
  const sizes: number[] = [];
  for (let s = 1; s <= blockSize; s++) if (blockSize % s === 0) sizes.push(s);
  return sizes;
}

/** Style with a palette, where dithering makes a difference. */
export function styleHasPalette(style: FilterStyle): boolean {
  return style !== "photo" && style !== "gray";
}

/** Check and complete filter settings from the browser (unknown values fall back to defaults). */
export function validateFilter(raw: unknown, area: { width: number; height: number }): PixelFilter {
  const p = (raw ?? {}) as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : 0;
  const size = typeof p.pixelSize === "number" && Number.isInteger(p.pixelSize) ? p.pixelSize : 1;
  const style = FILTER_STYLES.includes(p.style as FilterStyle) ? (p.style as FilterStyle) : "photo";
  return {
    pixelSize: size >= 1 && size <= 100 && area.width % size === 0 && area.height % size === 0 ? size : 1,
    style,
    dither: p.dither === true && styleHasPalette(style),
    brightness: int(p.brightness, -50, 50),
    contrast: int(p.contrast, -50, 50),
    saturation: int(p.saturation, -50, 50),
  };
}

/** Size of the small picture the photo is scaled to before filtering. */
export function filterGrid(area: { width: number; height: number }, filter: Pick<PixelFilter, "pixelSize">) {
  return { width: area.width / filter.pixelSize, height: area.height / filter.pixelSize };
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Brightness, contrast and saturation, each −50 … 50. */
export function adjustColours(rgb: Uint8Array, f: Pick<PixelFilter, "brightness" | "contrast" | "saturation">): Uint8Array {
  if (!f.brightness && !f.contrast && !f.saturation) return rgb.slice();
  const out = new Uint8Array(rgb.length);
  const add = f.brightness * 2.55;
  const c = f.contrast * 2.55;
  const contrast = (259 * (c + 255)) / (255 * (259 - c));
  const sat = 1 + f.saturation / 50;
  for (let i = 0; i < rgb.length; i += 3) {
    let r = rgb[i] + add;
    let g = rgb[i + 1] + add;
    let b = rgb[i + 2] + add;
    r = contrast * (r - 128) + 128;
    g = contrast * (g - 128) + 128;
    b = contrast * (b - 128) + 128;
    const l = luminance(r, g, b);
    out[i] = clamp(l + (r - l) * sat);
    out[i + 1] = clamp(l + (g - l) * sat);
    out[i + 2] = clamp(l + (b - l) * sat);
  }
  return out;
}

function toGray(rgb: Uint8Array): Uint8Array {
  const out = new Uint8Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const l = clamp(luminance(rgb[i], rgb[i + 1], rgb[i + 2]));
    out[i] = l;
    out[i + 1] = l;
    out[i + 2] = l;
  }
  return out;
}

/** Map a grey picture onto a palette ordered from dark to light, by brightness. */
function shadesToPalette(gray: Uint8Array, width: number, height: number, palette: readonly Rgb[], dither: boolean): Uint8Array {
  const steps: Rgb[] = palette.map((_, i) => {
    const v = Math.round((i * 255) / (palette.length - 1));
    return [v, v, v] as const;
  });
  const levels = mapToPalette(gray, width, height, steps, dither);
  const out = new Uint8Array(levels.length);
  for (let i = 0; i < levels.length; i += 3) {
    const p = palette[Math.round((levels[i] * (palette.length - 1)) / 255)]!;
    out[i] = p[0];
    out[i + 1] = p[1];
    out[i + 2] = p[2];
  }
  return out;
}

/** Filter the small picture (width × height dots, RGB). */
export function applyFilter(rgb: Uint8Array, width: number, height: number, f: PixelFilter): Uint8Array {
  const adjusted = adjustColours(rgb, f);
  switch (f.style) {
    case "photo":
      return adjusted;
    case "gray":
      return toGray(adjusted);
    case "gameboy":
      return shadesToPalette(toGray(adjusted), width, height, GAMEBOY, f.dither);
    case "bw":
      return shadesToPalette(toGray(adjusted), width, height, BLACK_WHITE, f.dither);
    default: {
      const colours = RETRO_COLOURS[f.style] ?? 32;
      return mapToPalette(adjusted, width, height, medianCutPalette(adjusted, colours), f.dither);
    }
  }
}

/** Every dot becomes a size × size square (nearest neighbour). */
export function enlarge(rgb: Uint8Array, width: number, height: number, size: number): Uint8Array {
  if (size === 1) return rgb;
  const W = width * size;
  const out = new Uint8Array(W * height * size * 3);
  for (let y = 0; y < height * size; y++) {
    const sy = Math.floor(y / size);
    for (let x = 0; x < W; x++) {
      const s = (sy * width + Math.floor(x / size)) * 3;
      const d = (y * W + x) * 3;
      out[d] = rgb[s];
      out[d + 1] = rgb[s + 1];
      out[d + 2] = rgb[s + 2];
    }
  }
  return out;
}

/** RGBA (canvas ImageData) → RGB on white. */
export function rgbaToRgb(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const a = rgba[i + 3] / 255;
    out[j] = Math.round(rgba[i] * a + 255 * (1 - a));
    out[j + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
    out[j + 2] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
  }
  return out;
}

/** RGB → RGBA for putting into a canvas. */
export function rgbToRgba(rgb: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray((rgb.length / 3) * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = rgb[i];
    out[j + 1] = rgb[i + 1];
    out[j + 2] = rgb[i + 2];
    out[j + 3] = 255;
  }
  return out;
}

/** How many colour dots the result has. */
export function dotCount(area: { width: number; height: number }, pixelSize: number): number {
  return (area.width / pixelSize) * (area.height / pixelSize);
}
