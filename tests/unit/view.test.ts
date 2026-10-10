import { describe, expect, it } from "vitest";
import {
  centerOn,
  clampView,
  lerpView,
  MAX_ZOOM,
  panBy,
  stepZoom,
  toScreen,
  toWall,
  zoomAt,
  zoomForRect,
  type Dims,
} from "@/components/wall/view";

const desktop: Dims = { wallW: 1000, wallH: 1000, frameW: 1000, frameH: 1000 };
const phone: Dims = { wallW: 1000, wallH: 1000, frameW: 343, frameH: 343 };

describe("wall view math", () => {
  it("shows the whole wall at 100 % and never scrolls past its edges", () => {
    expect(clampView({ zoom: 1, ox: 50, oy: -20 }, desktop)).toEqual({ zoom: 1, ox: 0, oy: 0 });
    expect(clampView({ zoom: 2, ox: 900, oy: 900 }, desktop)).toEqual({ zoom: 2, ox: 500, oy: 500 });
    expect(clampView({ zoom: 20, ox: 0, oy: 0 }, desktop).zoom).toBe(MAX_ZOOM);
    expect(clampView({ zoom: 0.2, ox: 0, oy: 0 }, desktop).zoom).toBe(1);
  });

  it("does not produce NaN before the frame has a size", () => {
    const v = clampView({ zoom: 3, ox: 10, oy: 10 }, { wallW: 1000, wallH: 1000, frameW: 0, frameH: 0 });
    expect(v).toEqual({ zoom: 3, ox: 0, oy: 0 });
  });

  it("keeps the wall point under the cursor in place when zooming", () => {
    for (const d of [desktop, phone]) {
      const before = { zoom: 2, ox: 120, oy: 300 };
      const at = { x: d.frameW * 0.3, y: d.frameH * 0.7 };
      const p0 = toWall(before, d, at.x, at.y);
      const after = zoomAt(before, d, 4, at.x, at.y);
      const p1 = toWall(after, d, at.x, at.y);
      expect(after.zoom).toBe(4);
      expect(p1.wx).toBeCloseTo(p0.wx, 6);
      expect(p1.wy).toBeCloseTo(p0.wy, 6);
    }
  });

  it("converts between screen and wall coordinates", () => {
    const v = { zoom: 4, ox: 100, oy: 200 };
    const { sx, sy } = toScreen(v, phone, 150, 250);
    const back = toWall(v, phone, sx, sy);
    expect(back.wx).toBeCloseTo(150, 9);
    expect(back.wy).toBeCloseTo(250, 9);
  });

  it("centres on a point, clamped at the edges", () => {
    const v = centerOn(desktop, 500, 500, 4);
    expect(toWall(v, desktop, 500, 500).wx).toBeCloseTo(500);
    expect(centerOn(desktop, 0, 0, 4)).toEqual({ zoom: 4, ox: 0, oy: 0 });
  });

  it("pans in screen pixels and stops at the edge", () => {
    expect(panBy({ zoom: 2, ox: 100, oy: 100 }, desktop, -100, 0)).toEqual({ zoom: 2, ox: 150, oy: 100 });
    expect(panBy({ zoom: 1, ox: 0, oy: 0 }, desktop, 50, 50)).toEqual({ zoom: 1, ox: 0, oy: 0 });
  });

  it("steps through 100 / 200 / 400 / 800 %", () => {
    expect(stepZoom(1, 1)).toBe(2);
    expect(stepZoom(2, 1)).toBe(4);
    expect(stepZoom(3, 1)).toBe(4);
    expect(stepZoom(8, 1)).toBe(8);
    expect(stepZoom(3, -1)).toBe(2);
    expect(stepZoom(1, -1)).toBe(1);
  });

  it("chooses a comfortable zoom for a rental", () => {
    expect(zoomForRect(desktop, 10, 10)).toBe(8);
    expect(zoomForRect(desktop, 100, 100)).toBe(4);
    expect(zoomForRect(desktop, 1000, 500)).toBe(1);
  });

  it("animates between views ending exactly at the target", () => {
    const a = { zoom: 1, ox: 0, oy: 0 };
    const b = centerOn(desktop, 700, 300, 8);
    const end = lerpView(a, b, 1, desktop);
    expect(end.zoom).toBeCloseTo(8);
    expect(end.ox).toBeCloseTo(b.ox);
    expect(end.oy).toBeCloseTo(b.oy);
    const mid = lerpView(a, b, 0.5, desktop);
    expect(mid.zoom).toBeCloseTo(Math.sqrt(8));
  });
});
