/**
 * Pan & zoom math. The frame shows the wall scaled by `fit` (frame width /
 * wall width) times `zoom` (1 = whole wall visible … 8 = 800 %). `ox`/`oy`
 * are the wall pixel coordinates at the frame's top-left corner.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_LEVELS = [1, 2, 4, 8] as const;

export interface View {
  zoom: number;
  ox: number;
  oy: number;
}

export interface Dims {
  /** Wall size in wall pixels. */
  wallW: number;
  wallH: number;
  /** Frame size in CSS pixels. */
  frameW: number;
  frameH: number;
}

export const fitOf = (d: Dims) => (d.wallW > 0 ? d.frameW / d.wallW : 1);
export const scaleOf = (v: View, d: Dims) => fitOf(d) * v.zoom;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function clampView(v: View, d: Dims): View {
  const zoom = clampZoom(v.zoom);
  // Not laid out yet: nothing sensible to clamp against.
  if (!(d.frameW > 0) || !(d.frameH > 0) || !(d.wallW > 0)) return { zoom, ox: 0, oy: 0 };
  const s = fitOf(d) * zoom;
  const maxX = Math.max(0, d.wallW - d.frameW / s);
  const maxY = Math.max(0, d.wallH - d.frameH / s);
  return { zoom, ox: Math.min(maxX, Math.max(0, v.ox)), oy: Math.min(maxY, Math.max(0, v.oy)) };
}

/** Wall coordinates (fractional wall pixels) under a frame point. */
export function toWall(v: View, d: Dims, sx: number, sy: number): { wx: number; wy: number } {
  const s = scaleOf(v, d);
  return { wx: v.ox + sx / s, wy: v.oy + sy / s };
}

/** Frame coordinates of a wall point. */
export function toScreen(v: View, d: Dims, wx: number, wy: number): { sx: number; sy: number } {
  const s = scaleOf(v, d);
  return { sx: (wx - v.ox) * s, sy: (wy - v.oy) * s };
}

/** Change zoom keeping the wall point under (sx, sy) in place. */
export function zoomAt(v: View, d: Dims, zoom: number, sx: number, sy: number): View {
  const { wx, wy } = toWall(v, d, sx, sy);
  const s = fitOf(d) * clampZoom(zoom);
  return clampView({ zoom, ox: wx - sx / s, oy: wy - sy / s }, d);
}

/** View centred on a wall point. */
export function centerOn(d: Dims, wx: number, wy: number, zoom: number): View {
  const s = fitOf(d) * clampZoom(zoom);
  return clampView({ zoom, ox: wx - d.frameW / s / 2, oy: wy - d.frameH / s / 2 }, d);
}

export function panBy(v: View, d: Dims, dxScreen: number, dyScreen: number): View {
  const s = scaleOf(v, d);
  return clampView({ zoom: v.zoom, ox: v.ox - dxScreen / s, oy: v.oy - dyScreen / s }, d);
}

/** A zoom that shows a rectangle (wall pixels) comfortably, about 40 % of the frame. */
export function zoomForRect(d: Dims, wPx: number, hPx: number): number {
  const z = (Math.min(d.wallW, d.wallH) * 0.4) / Math.max(wPx, hPx, 1);
  return clampZoom(Math.round(z * 4) / 4);
}

/** Next level of ZOOM_LEVELS in a direction. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_LEVELS.find((z) => z > zoom + 0.01) ?? MAX_ZOOM;
  return [...ZOOM_LEVELS].reverse().find((z) => z < zoom - 0.01) ?? MIN_ZOOM;
}

/** Animation step between two views: zoom in log space, centre linearly. */
export function lerpView(a: View, b: View, t: number, d: Dims): View {
  const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t);
  const center = (v: View) => {
    const s = fitOf(d) * v.zoom;
    return { cx: v.ox + d.frameW / s / 2, cy: v.oy + d.frameH / s / 2 };
  };
  const ca = center(a);
  const cb = center(b);
  return centerOn(d, ca.cx + (cb.cx - ca.cx) * t, ca.cy + (cb.cy - ca.cy) * t, zoom);
}
