import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { drawText, GLYPH_HEIGHT, GLYPH_WIDTH, glyph, hasGlyph, textWidth, wrapText } from "@/lib/pixel-font";
import { EMPTY_COLOR, Raster } from "@/lib/wall/raster";

describe("raster", () => {
  it("fills and blits with clipping at the edges", () => {
    const canvas = Raster.filled(20, 10, EMPTY_COLOR);
    canvas.fill(-5, -5, 10, 10, [255, 0, 0]);
    expect(canvas.getPixel(0, 0)).toEqual([255, 0, 0]);
    expect(canvas.getPixel(4, 4)).toEqual([255, 0, 0]);
    expect(canvas.getPixel(5, 5)).toEqual(EMPTY_COLOR);

    const tile = Raster.filled(4, 4, [0, 0, 255]);
    canvas.blit(tile, 18, 8);
    expect(canvas.getPixel(19, 9)).toEqual([0, 0, 255]);
    expect(canvas.getPixel(17, 9)).toEqual(EMPTY_COLOR);
  });

  it("round-trips through PNG and lossless WebP pixel for pixel", async () => {
    const r = new Raster(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) r.setPixel(x, y, [x * 16, y * 16, (x * y) % 256]);
    for (const encoded of [await r.encodePng(), await r.encodeWebp()]) {
      const back = await Raster.decode(encoded);
      expect(back.width).toBe(16);
      expect(back.data.equals(r.data)).toBe(true);
    }
  });

  it("flattens transparency onto the empty-wall colour", async () => {
    const transparent = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const r = await Raster.decode(transparent);
    expect(r.getPixel(1, 1)).toEqual(EMPTY_COLOR);
  });
});

describe("pixel font", () => {
  it("has 5 × 7 glyphs", () => {
    for (const ch of "AZaz09!?€♥ ") {
      const g = glyph(ch);
      expect(g).toHaveLength(GLYPH_HEIGHT);
      for (const row of g) expect(row).toHaveLength(GLYPH_WIDTH);
    }
  });

  it("has Slovak letters and falls back to the base letter for unknown diacritics", () => {
    for (const ch of "áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ") {
      expect(hasGlyph(ch), ch).toBe(true);
      expect(glyph(ch), ch).not.toEqual(glyph(ch.normalize("NFD")[0]));
      expect(glyph(ch), ch).toHaveLength(GLYPH_HEIGHT);
      for (const row of glyph(ch)) expect(row, ch).toHaveLength(GLYPH_WIDTH);
    }
    expect(glyph("ā")).toEqual(glyph("a"));
    // Lowercase and uppercase with the same accent stay distinguishable.
    expect(glyph("ó")).not.toEqual(glyph("Ó"));
  });

  it("measures and wraps text", () => {
    expect(textWidth("")).toBe(0);
    expect(textWidth("A")).toBe(5);
    expect(textWidth("AB")).toBe(11);
    // One 10 × 10 block holds exactly one character.
    expect(wrapText("A", 10, 10)).toEqual({ lines: ["A"], fits: true, brokeWords: false });
    expect(wrapText("AB", 10, 10).fits).toBe(false);
    expect(wrapText("Hello world", 40, 20)).toEqual({ lines: ["Hello", "world"], fits: true, brokeWords: false });
    expect(wrapText("Supercalifragilistic", 30, 100).lines[0]).toBe("Super");
  });

  it("draws through a plot callback", () => {
    const points: string[] = [];
    drawText("I", 0, 0, (x, y) => points.push(`${x},${y}`));
    expect(points).toContain("2,3");
    expect(points).not.toContain("0,3");
  });
});
