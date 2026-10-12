import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOGO_COLORS, LOGO_ROWS, LOGO_SIZE, logoPixels, logoRects, logoSvg } from "@/lib/logo";

describe("logo", () => {
  it("is a full square of known colours", () => {
    expect(LOGO_ROWS).toHaveLength(LOGO_SIZE);
    for (const row of LOGO_ROWS) {
      expect(row).toHaveLength(LOGO_SIZE);
      for (const ch of row) expect(LOGO_COLORS[ch], `colour "${ch}"`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("covers every block exactly once with its rectangles", () => {
    const seen = Array.from({ length: LOGO_SIZE }, () => Array<string>(LOGO_SIZE).fill(""));
    for (const r of logoRects()) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          expect(seen[y]![x], `block ${x},${y}`).toBe("");
          seen[y]![x] = r.fill;
        }
      }
    }
    LOGO_ROWS.forEach((row, y) => [...row].forEach((ch, x) => expect(seen[y]![x]).toBe(LOGO_COLORS[ch])));
  });

  it("scales without blur: every pixel has one of the logo colours", () => {
    const colours = new Set(Object.values(LOGO_COLORS));
    const data = logoPixels(48);
    for (let i = 0; i < data.length; i += 4) {
      const hex = `#${[data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      expect(colours.has(hex)).toBe(true);
    }
  });

  it("matches the icon file (run npm run logo after changing the logo)", () => {
    expect(readFileSync(path.resolve("src/app/icon.svg"), "utf8").replace(/\r\n/g, "\n")).toBe(logoSvg());
  });
});
