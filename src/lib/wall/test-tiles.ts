import { drawText, GLYPH_HEIGHT, textWidth } from "@/lib/pixel-font";
import { Raster, type Rgb } from "./raster";

/**
 * Procedural pixel-art tiles for the test-data script, so the development
 * wall looks like a real one: solid colours, patterns, initials, icons.
 */

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

const PALETTE: readonly Rgb[] = [
  [0xe6, 0x39, 0x46], [0xf1, 0xa2, 0x08], [0xff, 0xd1, 0x66], [0x06, 0xd6, 0xa0],
  [0x11, 0x8a, 0xb2], [0x07, 0x3b, 0x4c], [0x8e, 0x44, 0xad], [0xef, 0x47, 0x6f],
  [0x2a, 0x9d, 0x8f], [0x26, 0x46, 0x53], [0xe9, 0xc4, 0x6a], [0xf4, 0xa2, 0x61],
  [0xe7, 0x6f, 0x51], [0x3a, 0x86, 0xff], [0x83, 0x38, 0xec], [0xff, 0x00, 0x6e],
  [0xfb, 0x56, 0x07], [0x00, 0x00, 0x00], [0xff, 0xff, 0xff], [0x55, 0xa6, 0x30],
  [0x9b, 0x5d, 0xe5], [0x00, 0xbb, 0xf9], [0x00, 0xf5, 0xd4], [0xf1, 0x5b, 0xb5],
];

const ICONS: Record<string, string[]> = {
  heart: [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
  smiley: [".#####.", "#.....#", "#.#.#.#", "#.....#", "#.#.#.#", "#..#..#", ".#####."],
  star: ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", "#.....#"],
  house: ["...#...", "..###..", ".#####.", "#######", ".#...#.", ".#.#.#.", ".#.#.#."],
  tree: ["...#...", "..###..", ".#####.", "..###..", ".#####.", "#######", "...#..."],
};

function contrast(c: Rgb): Rgb {
  const luminance = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return luminance > 150 ? [0x11, 0x11, 0x11] : [0xff, 0xff, 0xff];
}

function darker(c: Rgb, f = 0.7): Rgb {
  return [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
}

/** A tile of exactly widthPx × heightPx. */
export function makeTestTile(widthPx: number, heightPx: number, rng: Rng, label: string): Raster {
  const bg = pick(rng, PALETTE);
  let fg = pick(rng, PALETTE);
  if (fg === bg) fg = contrast(bg);
  const tile = Raster.filled(widthPx, heightPx, bg);
  const style = pick(rng, ["solid", "border", "stripes", "checker", "gradient", "icon", "text", "text", "identicon"]);

  switch (style) {
    case "border": {
      const d = darker(bg);
      tile.fill(0, 0, widthPx, 1, d);
      tile.fill(0, heightPx - 1, widthPx, 1, d);
      tile.fill(0, 0, 1, heightPx, d);
      tile.fill(widthPx - 1, 0, 1, heightPx, d);
      break;
    }
    case "stripes": {
      const step = 2 + Math.floor(rng() * 4);
      for (let y = 0; y < heightPx; y++) {
        for (let x = 0; x < widthPx; x++) if (Math.floor((x + y) / step) % 2 === 0) tile.setPixel(x, y, fg);
      }
      break;
    }
    case "checker": {
      const size = Math.max(1, Math.floor(Math.min(widthPx, heightPx) / (2 + Math.floor(rng() * 4))));
      for (let y = 0; y < heightPx; y++) {
        for (let x = 0; x < widthPx; x++) if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) tile.setPixel(x, y, fg);
      }
      break;
    }
    case "gradient": {
      for (let y = 0; y < heightPx; y++) {
        const t = heightPx === 1 ? 0 : y / (heightPx - 1);
        const c: Rgb = [0, 1, 2].map((i) => Math.round(bg[i] * (1 - t) + fg[i] * t)) as unknown as Rgb;
        tile.fill(0, y, widthPx, 1, c);
      }
      break;
    }
    case "icon": {
      const icon = ICONS[pick(rng, Object.keys(ICONS))];
      const ih = icon.length;
      const iw = icon[0].length;
      const scale = Math.max(1, Math.floor(Math.min(widthPx / (iw + 2), heightPx / (ih + 2))));
      const ox = Math.floor((widthPx - iw * scale) / 2);
      const oy = Math.floor((heightPx - ih * scale) / 2);
      const ink = contrast(bg);
      icon.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch === "#") tile.fill(ox + x * scale, oy + y * scale, scale, scale, ink);
        }),
      );
      break;
    }
    case "text": {
      const ink = contrast(bg);
      const maxChars = Math.max(1, Math.floor((widthPx - 1) / 6));
      const text = label.slice(0, maxChars);
      const scale = Math.max(1, Math.min(Math.floor((widthPx - 2) / Math.max(1, textWidth(text))), Math.floor((heightPx - 2) / GLYPH_HEIGHT)));
      const ox = Math.floor((widthPx - textWidth(text) * scale) / 2);
      const oy = Math.floor((heightPx - GLYPH_HEIGHT * scale) / 2);
      drawText(text, ox, oy, (x, y) => tile.setPixel(x, y, ink), scale);
      break;
    }
    case "identicon": {
      // 5 × 5 mirrored pattern, the classic "avatar" look.
      const cells = 5;
      const size = Math.max(1, Math.floor(Math.min(widthPx, heightPx) / (cells + 1)));
      const ox = Math.floor((widthPx - cells * size) / 2);
      const oy = Math.floor((heightPx - cells * size) / 2);
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < 3; x++) {
          if (rng() < 0.5) continue;
          tile.fill(ox + x * size, oy + y * size, size, size, fg);
          tile.fill(ox + (cells - 1 - x) * size, oy + y * size, size, size, fg);
        }
      }
      break;
    }
    default:
      break;
  }
  return tile;
}
