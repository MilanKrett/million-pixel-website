import { rectContainsPoint, type Rect } from "@/lib/geometry";
import { CELL_FREE, type WallModel } from "./model";
import { fitOf, type Dims, type View } from "./view";

/**
 * Canvas drawing of the wall. The image is drawn with nearest-neighbour
 * sampling at every zoom level, so pixels stay sharp squares in every
 * browser; grid, highlights and reserved areas are drawn on top in device
 * pixels so lines are always crisp.
 */

const EMPTY = "#f4f4f4";

export interface Overlay {
  hover: Rect | null;
  selected: Rect | null;
  cursor: { bx: number; by: number } | null;
  showFree: boolean;
  /** Rent mode: the area being chosen, with corner handles. */
  selection: Rect | null;
  /** Rent mode: free spots offered by "Find me a spot". */
  suggestions: Rect[];
  /** Rent mode: the buyer's current reservation while choosing a new place. */
  own: Rect | null;
  /** Handle size in CSS px (bigger on touch screens). */
  handleSize: number;
}

/** One pixel per block, free blocks tinted; drawn scaled up over the wall. */
export function createFreeLayer(model: WallModel): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = model.cols;
  canvas.height = model.rows;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(model.cols, model.rows);
  for (let i = 0; i < model.cells.length; i++) {
    if (model.cells[i] !== CELL_FREE) continue;
    image.data[i * 4] = 0x22;
    image.data[i * 4 + 1] = 0xc5;
    image.data[i * 4 + 2] = 0x5e;
    image.data[i * 4 + 3] = 150;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const patterns = new WeakMap<CanvasRenderingContext2D, { taken: CanvasPattern; hold: CanvasPattern }>();

function hatch(ctx: CanvasRenderingContext2D, background: string, line: string): CanvasPattern {
  const size = 6;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const p = c.getContext("2d")!;
  p.fillStyle = background;
  p.fillRect(0, 0, size, size);
  p.strokeStyle = line;
  p.lineWidth = 1;
  p.beginPath();
  p.moveTo(0, size);
  p.lineTo(size, 0);
  p.moveTo(-1, 1);
  p.lineTo(1, -1);
  p.moveTo(size - 1, size + 1);
  p.lineTo(size + 1, size - 1);
  p.stroke();
  return ctx.createPattern(c, "repeat")!;
}

function getPatterns(ctx: CanvasRenderingContext2D) {
  let p = patterns.get(ctx);
  if (!p) {
    p = { taken: hatch(ctx, "#dddddd", "rgba(0,0,0,0.28)"), hold: hatch(ctx, "#f4f4f4", "rgba(232,89,12,0.6)") };
    patterns.set(ctx, p);
  }
  return p;
}

interface Transform {
  s: number; // device px per wall px
  tx: number;
  ty: number;
}

function deviceRect(r: Rect, block: number, t: Transform) {
  const x0 = Math.round(r.x * block * t.s + t.tx);
  const y0 = Math.round(r.y * block * t.s + t.ty);
  const x1 = Math.round((r.x + r.w) * block * t.s + t.tx);
  const y1 = Math.round((r.y + r.h) * block * t.s + t.ty);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

function outline(ctx: CanvasRenderingContext2D, d: { x: number; y: number; w: number; h: number }, width: number, color: string, grow: number) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  const o = grow + width / 2;
  ctx.strokeRect(d.x - o, d.y - o, d.w + 2 * o, d.h + 2 * o);
}

export function drawWall(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource | null,
  model: WallModel,
  view: View,
  dims: Dims,
  dpr: number,
  overlay: Overlay,
  freeLayer: HTMLCanvasElement | null,
): void {
  const { width: W, height: H } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = EMPTY;
  ctx.fillRect(0, 0, W, H);

  const s = fitOf(dims) * view.zoom * dpr;
  const t: Transform = { s, tx: Math.round(-view.ox * s), ty: Math.round(-view.oy * s) };

  ctx.setTransform(s, 0, 0, s, t.tx, t.ty);
  if (image) ctx.drawImage(image, 0, 0, model.width, model.height);
  if (overlay.showFree && freeLayer) ctx.drawImage(freeLayer, 0, 0, model.width, model.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const { taken, holds } = model.snapshot;
  if (taken.length || holds.length) {
    const p = getPatterns(ctx);
    ctx.fillStyle = p.taken;
    for (const [x, y, w, h] of taken) {
      const d = deviceRect({ x, y, w, h }, model.block, t);
      ctx.fillRect(d.x, d.y, d.w, d.h);
    }
    ctx.fillStyle = p.hold;
    for (const [x, y, w, h] of holds) {
      const d = deviceRect({ x, y, w, h }, model.block, t);
      ctx.fillRect(d.x, d.y, d.w, d.h);
    }
  }

  // Fine block grid from 200 % (and only when blocks are big enough to see).
  const blockCss = model.block * fitOf(dims) * view.zoom;
  if (view.zoom >= 2 - 1e-6 && blockCss >= 8) {
    const bx0 = Math.max(0, Math.floor(view.ox / model.block));
    const by0 = Math.max(0, Math.floor(view.oy / model.block));
    const bx1 = Math.min(model.cols, Math.ceil((view.ox + dims.frameW / (fitOf(dims) * view.zoom)) / model.block));
    const by1 = Math.min(model.rows, Math.ceil((view.oy + dims.frameH / (fitOf(dims) * view.zoom)) / model.block));
    ctx.beginPath();
    for (let bx = bx0; bx <= bx1; bx++) {
      const x = Math.round(bx * model.block * s + t.tx) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let by = by0; by <= by1; by++) {
      const y = Math.round(by * model.block * s + t.ty) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = blockCss >= 20 ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.09)";
    ctx.stroke();
  }

  const px = Math.max(1, Math.round(dpr));
  if (overlay.hover) {
    const d = deviceRect(overlay.hover, model.block, t);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(d.x, d.y, d.w, d.h);
    outline(ctx, d, px, "rgba(0,0,0,0.75)", 0);
  }
  if (overlay.selected) {
    const d = deviceRect(overlay.selected, model.block, t);
    outline(ctx, d, 3 * px, "#ffffff", 0);
    outline(ctx, d, px, "#000000", 3 * px);
    outline(ctx, d, px, "#000000", -px);
  }
  if (overlay.suggestions.length) {
    ctx.setLineDash([4 * px, 3 * px]);
    for (const r of overlay.suggestions) {
      const d = deviceRect(r, model.block, t);
      ctx.fillStyle = "rgba(47,158,68,0.25)";
      ctx.fillRect(d.x, d.y, d.w, d.h);
      outline(ctx, d, 2 * px, "#2f9e44", 0);
    }
    ctx.setLineDash([]);
  }
  if (overlay.own) {
    ctx.setLineDash([4 * px, 3 * px]);
    outline(ctx, deviceRect(overlay.own, model.block, t), 2 * px, "#e8590c", 0);
    ctx.setLineDash([]);
  }

  if (overlay.selection) {
    const sel = overlay.selection;
    const own = overlay.own;
    const d = deviceRect(sel, model.block, t);
    ctx.fillStyle = "rgba(25,113,194,0.25)";
    ctx.fillRect(d.x, d.y, d.w, d.h);
    // Blocks already taken inside the selection are shown in red.
    ctx.fillStyle = "rgba(224,49,49,0.75)";
    for (let by = sel.y; by < sel.y + sel.h; by++) {
      for (let bx = sel.x; bx < sel.x + sel.w; bx++) {
        if (bx < 0 || by < 0 || bx >= model.cols || by >= model.rows) continue;
        if (model.cells[by * model.cols + bx] === CELL_FREE) continue;
        if (own && rectContainsPoint(own, bx, by)) continue;
        const c = deviceRect({ x: bx, y: by, w: 1, h: 1 }, model.block, t);
        ctx.fillRect(c.x, c.y, c.w, c.h);
      }
    }
    outline(ctx, d, px, "#ffffff", px);
    outline(ctx, d, 2 * px, "#1971c2", -px);
    const hs = Math.round(overlay.handleSize * dpr);
    for (const [cx, cy] of [
      [d.x, d.y],
      [d.x + d.w, d.y],
      [d.x, d.y + d.h],
      [d.x + d.w, d.y + d.h],
    ]) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
      ctx.lineWidth = px;
      ctx.strokeStyle = "#1971c2";
      ctx.strokeRect(cx - hs / 2 + 0.5 * px, cy - hs / 2 + 0.5 * px, hs - px, hs - px);
    }
  }

  if (overlay.cursor) {
    const d = deviceRect({ x: overlay.cursor.bx, y: overlay.cursor.by, w: 1, h: 1 }, model.block, t);
    ctx.setLineDash([3 * px, 2 * px]);
    outline(ctx, d, px, "#000000", px);
    ctx.setLineDash([]);
  }
}

/** The magnifier: a circle showing the area around a wall point, enlarged. */
export function drawLoupe(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource | null,
  model: WallModel,
  wx: number,
  wy: number,
  magnification: number,
  dpr: number,
): void {
  const { width: W, height: H } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = EMPTY;
  ctx.fillRect(0, 0, W, H);
  const s = magnification * dpr;
  const tx = Math.round(W / 2 - wx * s);
  const ty = Math.round(H / 2 - wy * s);
  ctx.setTransform(s, 0, 0, s, tx, ty);
  if (image) ctx.drawImage(image, 0, 0, model.width, model.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (model.block * s >= 6 * dpr) {
    ctx.beginPath();
    const bx0 = Math.floor((0 - tx) / s / model.block);
    const bx1 = Math.ceil((W - tx) / s / model.block);
    const by0 = Math.floor((0 - ty) / s / model.block);
    const by1 = Math.ceil((H - ty) / s / model.block);
    for (let bx = bx0; bx <= bx1; bx++) {
      const x = Math.round(bx * model.block * s + tx) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let by = by0; by <= by1; by++) {
      const y = Math.round(by * model.block * s + ty) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.stroke();
  }

  // Mark the exact pixel under the pointer.
  const x = Math.round(Math.floor(wx) * s + tx);
  const y = Math.round(Math.floor(wy) * s + ty);
  const size = Math.max(2, Math.round(s));
  const px = Math.max(1, Math.round(dpr));
  ctx.lineWidth = px;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(x - px * 1.5, y - px * 1.5, size + px * 3, size + px * 3);
  ctx.strokeStyle = "#000000";
  ctx.strokeRect(x - px * 0.5, y - px * 0.5, size + px, size + px);
}
