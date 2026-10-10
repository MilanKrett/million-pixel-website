import type { Rect } from "@/lib/geometry";

/**
 * Free-space search on the block grid ("Find me a spot" and the alternatives
 * offered when a chosen spot was taken in the meantime).
 */

export interface Grid {
  cols: number;
  rows: number;
  /** 1 = occupied, one entry per block, row by row. */
  occupied: Uint8Array;
}

export function occupancyGrid(cols: number, rows: number, cells: Iterable<{ bx: number; by: number }>): Grid {
  const occupied = new Uint8Array(cols * rows);
  for (const { bx, by } of cells) {
    if (bx >= 0 && by >= 0 && bx < cols && by < rows) occupied[by * cols + bx] = 1;
  }
  return { cols, rows, occupied };
}

/** Summed-area table: any rectangle's occupied count in O(1). */
export function prefixSums(grid: Grid): Int32Array {
  const { cols, rows, occupied } = grid;
  const w = cols + 1;
  const ps = new Int32Array(w * (rows + 1));
  for (let y = 0; y < rows; y++) {
    let rowSum = 0;
    for (let x = 0; x < cols; x++) {
      rowSum += occupied[y * cols + x];
      ps[(y + 1) * w + (x + 1)] = ps[y * w + (x + 1)] + rowSum;
    }
  }
  return ps;
}

export function occupiedCount(ps: Int32Array, cols: number, r: Rect): number {
  const w = cols + 1;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  return ps[y1 * w + x1] - ps[r.y * w + x1] - ps[y1 * w + r.x] + ps[r.y * w + r.x];
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export interface FindOptions {
  /** Prefer spots whose centre is closest to this point (in blocks). Default: wall centre. */
  near?: { x: number; y: number };
  nearest?: number;
  random?: number;
  rng?: () => number;
}

/**
 * Free w × h spots: the `nearest` ones closest to `near` plus `random` others,
 * none of them overlapping each other.
 */
export function findFreeSpots(grid: Grid, w: number, h: number, options: FindOptions = {}): { nearest: Rect[]; random: Rect[] } {
  const { cols, rows } = grid;
  if (w < 1 || h < 1 || w > cols || h > rows) return { nearest: [], random: [] };
  const ps = prefixSums(grid);
  const near = options.near ?? { x: cols / 2, y: rows / 2 };
  const candidates: { r: Rect; d: number }[] = [];
  for (let y = 0; y + h <= rows; y++) {
    for (let x = 0; x + w <= cols; x++) {
      const r = { x, y, w, h };
      if (occupiedCount(ps, cols, r) === 0) {
        const dx = x + w / 2 - near.x;
        const dy = y + h / 2 - near.y;
        candidates.push({ r, d: dx * dx + dy * dy });
      }
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.r.y - b.r.y || a.r.x - b.r.x);

  const chosen: Rect[] = [];
  const nearest: Rect[] = [];
  for (const c of candidates) {
    if (nearest.length >= (options.nearest ?? 3)) break;
    if (chosen.some((o) => overlaps(o, c.r))) continue;
    nearest.push(c.r);
    chosen.push(c.r);
  }

  const rng = options.rng ?? Math.random;
  const random: Rect[] = [];
  const pool = candidates.map((c) => c.r).filter((r) => !chosen.some((o) => overlaps(o, r)));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const r of pool) {
    if (random.length >= (options.random ?? 3)) break;
    if (chosen.some((o) => overlaps(o, r))) continue;
    random.push(r);
    chosen.push(r);
  }
  return { nearest, random };
}
