import { describe, expect, it } from "vitest";
import {
  adjustColours,
  applyFilter,
  DEFAULT_FILTER,
  dotCount,
  enlarge,
  pixelSizesFor,
  validateFilter,
  type PixelFilter,
} from "@/lib/content/pixel-filter";
import { processUpload } from "@/lib/content/process";
import { Raster } from "@/lib/wall/raster";

const limits = { maxBytes: 10 * 1024 * 1024, maxPx: 6000, formats: ["png", "jpeg", "webp", "gif"] as const };

/** A colourful gradient, w × h, RGB. */
function gradient(w: number, h: number): Uint8Array {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      rgb[i] = Math.round((x / (w - 1)) * 255);
      rgb[i + 1] = Math.round((y / (h - 1)) * 255);
      rgb[i + 2] = Math.round(((x + y) / (w + h - 2)) * 255);
    }
  }
  return rgb;
}

function colours(rgb: Uint8Array): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < rgb.length; i += 3) set.add(`${rgb[i]},${rgb[i + 1]},${rgb[i + 2]}`);
  return set;
}

const filter = (f: Partial<PixelFilter>): PixelFilter => ({ ...DEFAULT_FILTER, ...f });

describe("pixel filter settings", () => {
  it("offers pixel sizes that fit whole blocks", () => {
    expect(pixelSizesFor(10)).toEqual([1, 2, 5, 10]);
    expect(dotCount({ width: 80, height: 40 }, 1)).toBe(3200);
    expect(dotCount({ width: 80, height: 40 }, 10)).toBe(32);
  });

  it("falls back to safe values for anything unexpected", () => {
    expect(validateFilter(null, { width: 50, height: 50 })).toEqual(DEFAULT_FILTER);
    expect(validateFilter({ pixelSize: 3, style: "evil", brightness: 999, dither: true }, { width: 50, height: 50 })).toEqual({
      ...DEFAULT_FILTER,
      brightness: 50,
    });
    // Dithering only for styles with a palette.
    expect(validateFilter({ style: "retro8", dither: true, pixelSize: 5 }, { width: 50, height: 50 })).toMatchObject({
      style: "retro8",
      dither: true,
      pixelSize: 5,
    });
  });
});

describe("pixel filter", () => {
  const w = 40;
  const h = 30;
  const rgb = gradient(w, h);

  it("keeps a photo as it is without adjustments", () => {
    expect(applyFilter(rgb, w, h, DEFAULT_FILTER)).toEqual(rgb);
  });

  it("reduces to the retro palette size, with or without dithering", () => {
    for (const dither of [false, true]) {
      expect(colours(applyFilter(rgb, w, h, filter({ style: "retro8", dither })))).toSatisfy((s: Set<string>) => s.size <= 8);
      expect(colours(applyFilter(rgb, w, h, filter({ style: "retro16", dither })))).toSatisfy((s: Set<string>) => s.size <= 16);
    }
  });

  it("uses only the four Game Boy greens, only black and white, or only greys", () => {
    const gameboy = colours(applyFilter(rgb, w, h, filter({ style: "gameboy", dither: true })));
    for (const c of gameboy) expect(["15,56,15", "48,98,48", "139,172,15", "155,188,15"]).toContain(c);
    expect([...colours(applyFilter(rgb, w, h, filter({ style: "bw" })))].sort()).toEqual(["0,0,0", "255,255,255"]);
    for (const c of colours(applyFilter(rgb, w, h, filter({ style: "gray" })))) {
      const [r, g, b] = c.split(",");
      expect(r === g && g === b).toBe(true);
    }
  });

  it("adjusts brightness, contrast and saturation", () => {
    const grey = new Uint8Array([100, 100, 100]);
    expect(adjustColours(grey, { brightness: 50, contrast: 0, saturation: 0 })[0]).toBeGreaterThan(200);
    expect(adjustColours(new Uint8Array([200, 200, 200]), { brightness: 0, contrast: 50, saturation: 0 })[0]).toBeGreaterThan(200);
    const red = adjustColours(new Uint8Array([200, 50, 50]), { brightness: 0, contrast: 0, saturation: -50 });
    expect(red[0]).toBe(red[1]);
  });

  it("enlarges every dot to a square of the pixel size", () => {
    const dots = new Uint8Array([255, 0, 0, 0, 0, 255]); // 2 × 1: red, blue
    const big = enlarge(dots, 2, 1, 3);
    expect(big.length).toBe(6 * 3 * 3);
    for (let y = 0; y < 3; y++) {
      expect([...big.slice((y * 6 + 2) * 3, (y * 6 + 3) * 3)]).toEqual([255, 0, 0]);
      expect([...big.slice((y * 6 + 3) * 3, (y * 6 + 4) * 3)]).toEqual([0, 0, 255]);
    }
  });
});

describe("photos through the pixel filter on the server", () => {
  it("makes exactly the rented size out of big pixels", async () => {
    const r = new Raster(200, 100);
    const g = gradient(200, 100);
    r.data.set(g);
    const { png } = await processUpload(await r.encodePng(), { x: 0, y: 0, w: 200, h: 100 }, { width: 40, height: 20 }, filter({ pixelSize: 5 }), limits);
    const out = await Raster.decode(png);
    expect([out.width, out.height]).toEqual([40, 20]);
    // Every 5 × 5 square has one colour.
    for (let by = 0; by < 4; by++) {
      for (let bx = 0; bx < 8; bx++) {
        const first = out.getPixel(bx * 5, by * 5);
        for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) expect(out.getPixel(bx * 5 + x, by * 5 + y)).toEqual(first);
      }
    }
  });

  it("applies the chosen style", async () => {
    const r = new Raster(64, 64);
    r.data.set(gradient(64, 64));
    const { png } = await processUpload(await r.encodePng(), { x: 0, y: 0, w: 64, h: 64 }, { width: 30, height: 30 }, filter({ style: "gameboy", pixelSize: 2 }), limits);
    const found = colours((await Raster.decode(png)).data);
    expect(found.size).toBeLessThanOrEqual(4);
    for (const c of found) expect(["15,56,15", "48,98,48", "139,172,15", "155,188,15"]).toContain(c);
  });
});
