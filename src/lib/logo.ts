/**
 * The site logo: a tiny wall full of pixel ads, 16 × 16 blocks. It is our own
 * drawing in the spirit of The Million Dollar Homepage (never their picture).
 * One letter per block, colours in LOGO_COLORS. Used by the header
 * (components/site/LogoMark.tsx), the share pictures (lib/og.ts) and the icon
 * files (scripts/logo-files.ts: src/app/icon.svg, favicon.ico, the desktop icon).
 */

export const LOGO_SIZE = 16;

export const LOGO_COLORS: Record<string, string> = {
  b: "#1c7ed6", // blue
  c: "#15aabf", // cyan
  g: "#2f9e44", // green
  k: "#212529", // black
  l: "#94d82d", // lime
  m: "#e64980", // pink
  n: "#283a8f", // navy
  o: "#e8590c", // orange (the site's accent colour)
  p: "#7048e8", // purple
  r: "#e03131", // red
  t: "#0ca678", // teal
  w: "#ffffff", // white
  y: "#fcc419", // yellow
};

// Each ad is a rectangle of one colour; white or dark blocks inside are its
// "text" lines and little logos.
export const LOGO_ROWS = [
  "bbbbbyyyrrrrkkkk",
  "bwwwbykyrwwrkllk",
  "bwwbbyyyppllkllk",
  "bbbbbgggppllkkkk",
  "ooommgwgcccccyyy",
  "oyommgggcnnncyyy",
  "ooonnrrrcccccyry",
  "lllnnryrwwwwwyyy",
  "lllnnrrrwkkkwyyy",
  "ggggttttmmmbbbbb",
  "gyygtwwtmwmbwwwb",
  "gyygttttmmmbbbbb",
  "ggggyykkkkkrrrrr",
  "ccccyykwwwkrwwwr",
  "cwwcyypppllrwwrr",
  "ccccyypppllrrrrr",
];

export interface LogoRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

/** The logo as few rectangles: runs of one colour per row, joined with equal runs below. */
export function logoRects(): LogoRect[] {
  const done: LogoRect[] = [];
  let open: LogoRect[] = [];
  LOGO_ROWS.forEach((row, y) => {
    const runs: LogoRect[] = [];
    for (let x = 0; x < row.length; ) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      runs.push({ x, y, w: end - x, h: 1, fill: LOGO_COLORS[row[x]!]! });
      x = end;
    }
    const next: LogoRect[] = [];
    for (const run of runs) {
      const above = open.find((r) => r.x === run.x && r.w === run.w && r.fill === run.fill);
      if (above) {
        above.h++;
        next.push(above);
        open = open.filter((r) => r !== above);
      } else {
        next.push(run);
      }
    }
    done.push(...open);
    open = next;
  });
  return [...done, ...open].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The logo as a standalone SVG file. */
export function logoSvg(): string {
  const rects = logoRects()
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}" shape-rendering="crispEdges">${rects}</svg>\n`;
}

/** RGB of a "#rrggbb" colour. */
export function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** The logo as RGBA pixels of `size` × `size` (nearest neighbour, sharp at every size). */
export function logoPixels(size: number): Buffer {
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = LOGO_ROWS[Math.floor((y * LOGO_SIZE) / size)]!;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = hexRgb(LOGO_COLORS[row[Math.floor((x * LOGO_SIZE) / size)]!]!);
      const o = (y * size + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return data;
}
