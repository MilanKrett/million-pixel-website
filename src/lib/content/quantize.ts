/**
 * Colour reduction for the pixel filter: a palette of at most N colours by
 * median cut, and mapping every pixel to its nearest palette colour, either
 * flat (like old pixel art) or with Floyd–Steinberg dithering. Pure code, the
 * same in the browser preview and on the server.
 */

export type Rgb = readonly [number, number, number];

interface Box {
  colours: number[]; // packed 0xRRGGBB
  weight: number;
}

const R = (c: number) => (c >> 16) & 255;
const G = (c: number) => (c >> 8) & 255;
const B = (c: number) => c & 255;

/** Large pictures: the palette is built from at most this many evenly spread pixels. */
const MAX_SAMPLES = 65_536;

function channelRanges(box: Box) {
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const c of box.colours) {
    const r = R(c), g = G(c), b = B(c);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  return { r: maxR - minR, g: maxG - minG, b: maxB - minB };
}

/** At most `colours` colours that represent the picture well (median cut). */
export function medianCutPalette(rgb: Uint8Array, colours: number): Rgb[] {
  const pixels = rgb.length / 3;
  const step = Math.max(1, Math.ceil(pixels / MAX_SAMPLES));
  const counts = new Map<number, number>();
  for (let p = 0; p < pixels; p += step) {
    const i = p * 3;
    const c = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  if (counts.size <= colours) return [...counts.keys()].map((c) => [R(c), G(c), B(c)] as const);

  let total = 0;
  for (const n of counts.values()) total += n;
  const boxes: Box[] = [{ colours: [...counts.keys()], weight: total }];
  while (boxes.length < colours) {
    // Split the heaviest box that still has more than one colour.
    let index = -1;
    let best = -1;
    boxes.forEach((box, i) => {
      if (box.colours.length < 2) return;
      const ranges = channelRanges(box);
      const score = box.weight * Math.max(ranges.r, ranges.g, ranges.b);
      if (score > best) {
        best = score;
        index = i;
      }
    });
    if (index < 0) break;
    const box = boxes[index];
    const ranges = channelRanges(box);
    const channel = ranges.r >= ranges.g && ranges.r >= ranges.b ? R : ranges.g >= ranges.b ? G : B;
    box.colours.sort((a, b) => channel(a) - channel(b) || a - b);
    // Weighted median: half of the pixels on each side.
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.colours.length - 1; i++) {
      acc += counts.get(box.colours[i])!;
      cut = i + 1;
      if (acc >= box.weight / 2) break;
    }
    const left = box.colours.slice(0, cut);
    const right = box.colours.slice(cut);
    const weightOf = (list: number[]) => list.reduce((s, c) => s + counts.get(c)!, 0);
    boxes.splice(index, 1, { colours: left, weight: weightOf(left) }, { colours: right, weight: weightOf(right) });
  }

  // Each box becomes the weighted average of its colours.
  return boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const c of box.colours) {
      const n = counts.get(c)!;
      r += R(c) * n;
      g += G(c) * n;
      b += B(c) * n;
    }
    return [Math.round(r / box.weight), Math.round(g / box.weight), Math.round(b / box.weight)] as const;
  });
}

/** Perceptual-ish distance (green counts most, as the eye sees it). */
function distance(r: number, g: number, b: number, p: Rgb): number {
  const dr = r - p[0], dg = g - p[1], db = b - p[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

function nearest(r: number, g: number, b: number, palette: readonly Rgb[]): Rgb {
  let best = palette[0]!;
  let bestDist = Infinity;
  for (const p of palette) {
    const d = distance(r, g, b, p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/**
 * Every pixel becomes a palette colour. With `dither`, the rounding error is
 * passed on to the neighbours (Floyd–Steinberg), which mixes dots of the
 * palette colours into smoother shades.
 */
export function mapToPalette(rgb: Uint8Array, width: number, height: number, palette: readonly Rgb[], dither: boolean): Uint8Array {
  const out = new Uint8Array(rgb.length);
  if (!palette.length) return rgb.slice();
  if (!dither) {
    const cache = new Map<number, Rgb>();
    for (let i = 0; i < rgb.length; i += 3) {
      const key = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
      let p = cache.get(key);
      if (!p) {
        p = nearest(rgb[i], rgb[i + 1], rgb[i + 2], palette);
        cache.set(key, p);
      }
      out[i] = p[0];
      out[i + 1] = p[1];
      out[i + 2] = p[2];
    }
    return out;
  }
  const work = Float32Array.from(rgb);
  const spread = (x: number, y: number, er: number, eg: number, eb: number, f: number) => {
    if (x < 0 || x >= width || y >= height) return;
    const j = (y * width + x) * 3;
    work[j] += er * f;
    work[j + 1] += eg * f;
    work[j + 2] += eb * f;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = Math.min(255, Math.max(0, work[i]));
      const g = Math.min(255, Math.max(0, work[i + 1]));
      const b = Math.min(255, Math.max(0, work[i + 2]));
      const p = nearest(r, g, b, palette);
      out[i] = p[0];
      out[i + 1] = p[1];
      out[i + 2] = p[2];
      const er = r - p[0], eg = g - p[1], eb = b - p[2];
      spread(x + 1, y, er, eg, eb, 7 / 16);
      spread(x - 1, y + 1, er, eg, eb, 3 / 16);
      spread(x, y + 1, er, eg, eb, 5 / 16);
      spread(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return out;
}

/** Reduce to at most `colours` colours, flat (no dithering). */
export function quantize(rgb: Uint8Array, colours: number): Uint8Array {
  return mapToPalette(rgb, rgb.length / 3, 1, medianCutPalette(rgb, colours), false);
}
