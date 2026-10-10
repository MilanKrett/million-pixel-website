import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ContentError, processDrawing, processText, processUpload, validateTextParams } from "@/lib/content/process";
import { Raster } from "@/lib/wall/raster";

const limits = { maxBytes: 10 * 1024 * 1024, maxPx: 6000, formats: ["png", "jpeg", "webp", "gif"] as const };

async function photo(width: number, height: number, withGps = false) {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg();
  return withGps
    ? img.withExif({ IFD0: { Artist: "Somebody", ImageDescription: "secret place" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 8/1 0/1" } }).toBuffer()
    : img.toBuffer();
}

describe("uploaded pictures", () => {
  it("crops and scales to exactly the rented size", async () => {
    const input = await photo(1200, 800);
    const { png, source, sourceExt } = await processUpload(input, { x: 100, y: 100, w: 600, h: 300 }, { width: 40, height: 20 }, 0, limits);
    const meta = await sharp(png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 40, 20]);
    expect(sourceExt).toBe("jpg");
    expect((await sharp(source).metadata()).width).toBe(1200);
  });

  it("removes EXIF and GPS data from the result and the stored original", async () => {
    const input = await photo(400, 400, true);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const { png, source } = await processUpload(input, { x: 0, y: 0, w: 400, h: 400 }, { width: 10, height: 10 }, 0, limits);
    for (const file of [png, source]) {
      const meta = await sharp(file).metadata();
      expect(meta.exif).toBeUndefined();
      expect(file.includes(Buffer.from("secret place"))).toBe(false);
    }
  });

  it("follows the EXIF orientation before cropping", async () => {
    // A 300 × 100 image stored with "rotate 90°": people see it as 100 × 300.
    const input = await sharp({ create: { width: 300, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await processUpload(input, { x: 0, y: 0, w: 100, h: 300 }, { width: 10, height: 30 }, 0, limits);
    expect((await sharp(result.png).metadata()).height).toBe(30);
  });

  it("puts transparent areas on white", async () => {
    const input = await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const { png } = await processUpload(input, { x: 0, y: 0, w: 20, h: 20 }, { width: 10, height: 10 }, 0, limits);
    expect((await Raster.decode(png)).getPixel(5, 5)).toEqual([255, 255, 255]);
  });

  it("can reduce the palette (retro effect)", async () => {
    const r = new Raster(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) r.setPixel(x, y, [x * 4, y * 4, (x + y) * 2]);
    const input = await r.encodePng();
    const { png } = await processUpload(input, { x: 0, y: 0, w: 64, h: 64 }, { width: 32, height: 32 }, 8, limits);
    const decoded = await Raster.decode(png);
    const colours = new Set<string>();
    for (let i = 0; i < decoded.data.length; i += 3) colours.add(`${decoded.data[i]},${decoded.data[i + 1]},${decoded.data[i + 2]}`);
    expect(colours.size).toBeLessThanOrEqual(8);
  });

  it("uses the first frame of an animated GIF", async () => {
    const frames = await sharp({ create: { width: 10, height: 20, channels: 3, background: { r: 0, g: 255, b: 0 } } }).raw().toBuffer();
    const gif = await sharp(frames, { raw: { width: 10, height: 20, channels: 3, pageHeight: 10 } as never }).gif().toBuffer();
    const { png } = await processUpload(gif, { x: 0, y: 0, w: 10, h: 10 }, { width: 10, height: 10 }, 0, limits);
    expect((await sharp(png).metadata()).pages ?? 1).toBe(1);
  });

  it("refuses files that are not supported pictures, whatever their name", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    await expect(processUpload(svg, { x: 0, y: 0, w: 10, h: 10 }, { width: 10, height: 10 }, 0, limits)).rejects.toMatchObject({ code: "unsupported_format" });
    await expect(processUpload(Buffer.from("not an image"), { x: 0, y: 0, w: 1, h: 1 }, { width: 10, height: 10 }, 0, limits)).rejects.toBeInstanceOf(ContentError);
    const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).tiff().toBuffer();
    await expect(processUpload(tiff, { x: 0, y: 0, w: 10, h: 10 }, { width: 10, height: 10 }, 0, limits)).rejects.toMatchObject({ code: "unsupported_format" });
  });

  it("enforces the size limits", async () => {
    const big = await photo(700, 100);
    await expect(processUpload(big, { x: 0, y: 0, w: 10, h: 10 }, { width: 10, height: 10 }, 0, { ...limits, maxPx: 600 })).rejects.toMatchObject({ code: "too_many_pixels" });
    await expect(processUpload(big, { x: 0, y: 0, w: 10, h: 10 }, { width: 10, height: 10 }, 0, { ...limits, maxBytes: 100 })).rejects.toMatchObject({ code: "too_large" });
    await expect(processUpload(big, { x: 0, y: 0, w: 0, h: 10 }, { width: 10, height: 10 }, 0, limits)).rejects.toMatchObject({ code: "bad_crop" });
  });
});

describe("drawings and text", () => {
  it("accepts a drawing of exactly the rented size only", async () => {
    const ok = await Raster.filled(30, 20, [1, 2, 3]).encodePng();
    expect((await sharp(await processDrawing(ok, { width: 30, height: 20 })).metadata()).width).toBe(30);
    const wrong = await Raster.filled(31, 20, [1, 2, 3]).encodePng();
    await expect(processDrawing(wrong, { width: 30, height: 20 })).rejects.toMatchObject({ code: "wrong_size" });
  });

  it("renders text in the pixel font", async () => {
    const params = validateTextParams({ background: "#FFCC00", color: "#000000", text: "Ahoj", align: "center", scale: 0 });
    const { png, fits } = await processText(params, { width: 40, height: 20 });
    expect(fits).toBe(true);
    const r = await Raster.decode(png);
    expect(r.getPixel(0, 0)).toEqual([255, 204, 0]);
    let ink = 0;
    for (let i = 0; i < r.data.length; i += 3) if (r.data[i] === 0) ink++;
    expect(ink).toBeGreaterThan(20);
  });

  it("rejects bad text parameters", () => {
    expect(() => validateTextParams({ background: "red", color: "#000000", text: "x" })).toThrow(ContentError);
    expect(() => validateTextParams({ background: "#ffffff", color: "#000000", text: "x".repeat(501) })).toThrow(ContentError);
    expect(validateTextParams({ background: "#FFFFFF", color: "#000000", text: "a\r\nb", align: "weird" })).toMatchObject({
      background: "#ffffff",
      text: "a\nb",
      align: "center",
      scale: 0,
    });
  });
});
