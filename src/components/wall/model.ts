import type { Rect } from "@/lib/geometry";
import type { WallRentalRow, WallSnapshot } from "@/lib/wall/snapshot";

/** Lookup structures for the wall in the browser. */

export const CELL_FREE = 0;
export const CELL_TAKEN = -1;
export const CELL_HOLD = -2;

export interface WallModel {
  snapshot: WallSnapshot;
  cols: number;
  rows: number;
  block: number;
  width: number;
  height: number;
  rentals: WallRentalRow[];
  /** One entry per block: rental index + 1, CELL_FREE, CELL_TAKEN or CELL_HOLD. */
  cells: Int32Array;
  byNumber: Map<number, number>;
  freeBlocks: number;
}

export type Hit =
  | { kind: "rental"; index: number }
  | { kind: "free" }
  | { kind: "taken" }
  | { kind: "hold" };

export function buildModel(snapshot: WallSnapshot): WallModel {
  const { cols, rows, block } = snapshot;
  const cells = new Int32Array(cols * rows);
  const mark = (x: number, y: number, w: number, h: number, value: number) => {
    for (let yy = Math.max(0, y); yy < Math.min(rows, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(cols, x + w); xx++) cells[yy * cols + xx] = value;
    }
  };
  for (const [x, y, w, h] of snapshot.holds) mark(x, y, w, h, CELL_HOLD);
  for (const [x, y, w, h] of snapshot.taken) mark(x, y, w, h, CELL_TAKEN);
  const byNumber = new Map<number, number>();
  snapshot.rentals.forEach((r, i) => {
    mark(r[1], r[2], r[3], r[4], i + 1);
    byNumber.set(r[0], i);
  });
  let freeBlocks = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] === CELL_FREE) freeBlocks++;
  return {
    snapshot,
    cols,
    rows,
    block,
    width: cols * block,
    height: rows * block,
    rentals: snapshot.rentals,
    cells,
    byNumber,
    freeBlocks,
  };
}

export function hitAt(model: WallModel, bx: number, by: number): Hit | null {
  if (bx < 0 || by < 0 || bx >= model.cols || by >= model.rows) return null;
  const v = model.cells[by * model.cols + bx];
  if (v > 0) return { kind: "rental", index: v - 1 };
  if (v === CELL_TAKEN) return { kind: "taken" };
  if (v === CELL_HOLD) return { kind: "hold" };
  return { kind: "free" };
}

/** Rectangle (in blocks) of the area containing a block: the rental, or the single block. */
export function areaRect(model: WallModel, hit: Hit, bx: number, by: number): Rect {
  if (hit.kind === "rental") return rentalRect(model.rentals[hit.index]);
  if (hit.kind === "taken" || hit.kind === "hold") {
    const list = hit.kind === "taken" ? model.snapshot.taken : model.snapshot.holds;
    const found = list.find(([x, y, w, h]) => bx >= x && by >= y && bx < x + w && by < y + h);
    if (found) return { x: found[0], y: found[1], w: found[2], h: found[3] };
  }
  return { x: bx, y: by, w: 1, h: 1 };
}

export function rentalRect(row: WallRentalRow): Rect {
  return { x: row[1], y: row[2], w: row[3], h: row[4] };
}

export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

const haystacks = new WeakMap<WallRentalRow[], string[]>();

/** Indices of rentals whose title, public name or link domain contains the query. */
export function searchRentals(model: WallModel, query: string, limit = 50): number[] {
  const q = normalizeText(query);
  if (!q) return [];
  let list = haystacks.get(model.rentals);
  if (!list) {
    list = model.rentals.map((r) => normalizeText(`${r[5]}\n${r[6]}\n${r[7]}`));
    haystacks.set(model.rentals, list);
  }
  const words = q.split(/\s+/);
  const results: number[] = [];
  for (let i = 0; i < list.length && results.length < limit; i++) {
    if (words.every((w) => list![i].includes(w))) results.push(i);
  }
  return results;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * The classic HTML image map (<area> per rental), rendered on the server so
 * the wall works without JavaScript and search engines can read it.
 */
export function imageMapHtml(rentals: readonly WallRentalRow[], block: number): string {
  let html = "";
  for (const [no, x, y, w, h, title, name, domain] of rentals) {
    const coords = `${x * block},${y * block},${(x + w) * block},${(y + h) * block}`;
    const alt = escapeHtml(`${title}${name ? ` — ${name}` : ""}${domain ? ` (${domain})` : ""}`);
    html += domain
      ? `<area shape="rect" coords="${coords}" href="/go/${no}" target="_blank" rel="nofollow sponsored ugc noopener noreferrer" title="${alt}" alt="${alt}">`
      : `<area shape="rect" coords="${coords}" title="${alt}" alt="${alt}">`;
  }
  return html;
}
