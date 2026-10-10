/**
 * "Retro effect": reduce an RGB image to at most `colours` colours with the
 * median-cut algorithm and no dithering (flat areas, like old pixel art).
 */

interface Box {
  colours: number[]; // packed 0xRRGGBB
  weight: number;
}

const R = (c: number) => (c >> 16) & 255;
const G = (c: number) => (c >> 8) & 255;
const B = (c: number) => c & 255;

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

export function quantize(rgb: Uint8Array, colours: number): Uint8Array {
  const counts = new Map<number, number>();
  for (let i = 0; i < rgb.length; i += 3) {
    const c = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  if (counts.size <= colours) return rgb.slice();

  const boxes: Box[] = [{ colours: [...counts.keys()], weight: rgb.length / 3 }];
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
    box.colours.sort((a, b) => channel(a) - channel(b));
    // Weighted median: half of the pixels on each side.
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.colours.length - 1; i++) {
      acc += counts.get(box.colours[i])!;
      if (acc >= box.weight / 2) {
        cut = i + 1;
        break;
      }
      cut = i + 1;
    }
    const left = box.colours.slice(0, cut);
    const right = box.colours.slice(cut);
    const weightOf = (list: number[]) => list.reduce((s, c) => s + counts.get(c)!, 0);
    boxes.splice(index, 1, { colours: left, weight: weightOf(left) }, { colours: right, weight: weightOf(right) });
  }

  // Each box becomes the weighted average of its colours.
  const palette = boxes.map((box) => {
    let r = 0, g = 0, b = 0;
    for (const c of box.colours) {
      const n = counts.get(c)!;
      r += R(c) * n;
      g += G(c) * n;
      b += B(c) * n;
    }
    return [Math.round(r / box.weight), Math.round(g / box.weight), Math.round(b / box.weight)] as const;
  });

  const nearest = new Map<number, readonly [number, number, number]>();
  for (const c of counts.keys()) {
    let bestDist = Infinity;
    let pick = palette[0];
    for (const p of palette) {
      const dr = R(c) - p[0], dg = G(c) - p[1], db = B(c) - p[2];
      const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (dist < bestDist) {
        bestDist = dist;
        pick = p;
      }
    }
    nearest.set(c, pick);
  }

  const out = new Uint8Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const p = nearest.get((rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2])!;
    out[i] = p[0];
    out[i + 1] = p[1];
    out[i + 2] = p[2];
  }
  return out;
}
