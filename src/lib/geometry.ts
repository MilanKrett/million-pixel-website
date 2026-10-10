/** A rectangle on the wall, in blocks unless stated otherwise. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContainsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

export function rectInsideGrid(r: Rect, cols: number, rows: number): boolean {
  return (
    Number.isInteger(r.x) &&
    Number.isInteger(r.y) &&
    Number.isInteger(r.w) &&
    Number.isInteger(r.h) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.w >= 1 &&
    r.h >= 1 &&
    r.x + r.w <= cols &&
    r.y + r.h <= rows
  );
}

/** Smallest rectangle containing all given rectangles. */
export function boundingRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Remove exact duplicates and rectangles fully covered by another one. */
export function dedupeRects(rects: readonly Rect[]): Rect[] {
  const unique = new Map<string, Rect>();
  for (const r of rects) unique.set(`${r.x},${r.y},${r.w},${r.h}`, r);
  const list = [...unique.values()];
  const contains = (o: Rect, r: Rect) => o.x <= r.x && o.y <= r.y && o.x + o.w >= r.x + r.w && o.y + o.h >= r.y + r.h;
  return list.filter((r, i) => !list.some((o, j) => j !== i && contains(o, r)));
}

/** Pixel range of a block rectangle, e.g. { x0: 340, x1: 379, y0: 120, y1: 139 }. */
export function pixelRange(r: Rect, block: number) {
  return { x0: r.x * block, x1: (r.x + r.w) * block - 1, y0: r.y * block, y1: (r.y + r.h) * block - 1 };
}
