import { describe, expect, it } from "vitest";
import { boundingRect, dedupeRects, pixelRange, rectContainsPoint, rectInsideGrid, rectsIntersect } from "@/lib/geometry";

describe("geometry", () => {
  it("detects overlapping rectangles (edges touching do not overlap)", () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false);
    expect(rectsIntersect({ x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 2, w: 2, h: 2 })).toBe(false);
    expect(rectsIntersect({ x: 5, y: 5, w: 1, h: 1 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });

  it("checks points against half-open rectangles", () => {
    const r = { x: 3, y: 4, w: 2, h: 1 };
    expect(rectContainsPoint(r, 3, 4)).toBe(true);
    expect(rectContainsPoint(r, 4, 4)).toBe(true);
    expect(rectContainsPoint(r, 5, 4)).toBe(false);
    expect(rectContainsPoint(r, 3, 5)).toBe(false);
  });

  it("validates rectangles against the 100 × 100 grid", () => {
    expect(rectInsideGrid({ x: 0, y: 0, w: 100, h: 100 }, 100, 100)).toBe(true);
    expect(rectInsideGrid({ x: 99, y: 99, w: 1, h: 1 }, 100, 100)).toBe(true);
    expect(rectInsideGrid({ x: 99, y: 99, w: 2, h: 1 }, 100, 100)).toBe(false);
    expect(rectInsideGrid({ x: -1, y: 0, w: 1, h: 1 }, 100, 100)).toBe(false);
    expect(rectInsideGrid({ x: 0, y: 0, w: 0, h: 1 }, 100, 100)).toBe(false);
    expect(rectInsideGrid({ x: 0.5, y: 0, w: 1, h: 1 }, 100, 100)).toBe(false);
  });

  it("computes the bounding rectangle", () => {
    expect(boundingRect([])).toBeNull();
    expect(boundingRect([{ x: 2, y: 3, w: 1, h: 1 }, { x: 10, y: 0, w: 5, h: 2 }])).toEqual({ x: 2, y: 0, w: 13, h: 4 });
  });

  it("removes duplicate and covered rectangles", () => {
    const result = dedupeRects([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 2, y: 2, w: 2, h: 2 },
      { x: 20, y: 20, w: 1, h: 1 },
    ]);
    expect(result).toEqual([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 20, w: 1, h: 1 },
    ]);
  });

  it("converts blocks to inclusive pixel ranges (x 340–379, y 120–139)", () => {
    expect(pixelRange({ x: 34, y: 12, w: 4, h: 2 }, 10)).toEqual({ x0: 340, x1: 379, y0: 120, y1: 139 });
  });
});
