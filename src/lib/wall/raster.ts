import sharp from "sharp";

export type Rgb = readonly [number, number, number];

/** Colour of free space on the wall (#f4f4f4). */
export const EMPTY_COLOR: Rgb = [0xf4, 0xf4, 0xf4];

// Never decode images larger than this many pixels (decompression bombs).
const MAX_INPUT_PIXELS = 40_000_000;

/** A plain RGB pixel buffer with the few operations the wall renderer needs. */
export class Raster {
  readonly data: Buffer;

  constructor(
    readonly width: number,
    readonly height: number,
    data?: Buffer,
  ) {
    if (data && data.length !== width * height * 3) {
      throw new Error(`Raster data size ${data.length} does not match ${width}×${height}`);
    }
    this.data = data ?? Buffer.alloc(width * height * 3);
  }

  static filled(width: number, height: number, color: Rgb): Raster {
    const r = new Raster(width, height);
    r.fill(0, 0, width, height, color);
    return r;
  }

  /** Decode any image sharp understands; transparency is flattened onto EMPTY_COLOR. */
  static async decode(input: Buffer): Promise<Raster> {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .flatten({ background: { r: EMPTY_COLOR[0], g: EMPTY_COLOR[1], b: EMPTY_COLOR[2] } })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) throw new Error(`Unexpected channel count ${info.channels}`);
    return new Raster(info.width, info.height, data);
  }

  /** Fill a rectangle (clipped to the raster). */
  fill(x: number, y: number, w: number, h: number, color: Rgb): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    if (x1 <= x0 || y1 <= y0) return;
    const row = Buffer.alloc((x1 - x0) * 3);
    for (let i = 0; i < x1 - x0; i++) {
      row[i * 3] = color[0];
      row[i * 3 + 1] = color[1];
      row[i * 3 + 2] = color[2];
    }
    for (let yy = y0; yy < y1; yy++) row.copy(this.data, (yy * this.width + x0) * 3);
  }

  /** Copy another raster onto this one at (dx, dy), clipped to both. */
  blit(src: Raster, dx: number, dy: number): void {
    const sx0 = Math.max(0, -dx);
    const sy0 = Math.max(0, -dy);
    const sx1 = Math.min(src.width, this.width - dx);
    const sy1 = Math.min(src.height, this.height - dy);
    if (sx1 <= sx0 || sy1 <= sy0) return;
    for (let sy = sy0; sy < sy1; sy++) {
      const from = (sy * src.width + sx0) * 3;
      const to = ((sy + dy) * this.width + sx0 + dx) * 3;
      src.data.copy(this.data, to, from, (sy * src.width + sx1) * 3);
    }
  }

  setPixel(x: number, y: number, color: Rgb): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.data[i] = color[0];
    this.data[i + 1] = color[1];
    this.data[i + 2] = color[2];
  }

  getPixel(x: number, y: number): Rgb {
    const i = (y * this.width + x) * 3;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  private sharp() {
    return sharp(this.data, { raw: { width: this.width, height: this.height, channels: 3 } });
  }

  encodePng(): Promise<Buffer> {
    return this.sharp().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  }

  /** Lossless WebP: identical pixels, roughly 25–35 % smaller than PNG. */
  encodeWebp(): Promise<Buffer> {
    return this.sharp().webp({ lossless: true, effort: 4 }).toBuffer();
  }
}
