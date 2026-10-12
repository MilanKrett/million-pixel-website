import sharp from "sharp";
import { logoPixels } from "@/lib/logo";

/** PNG of the logo at `size` × `size` pixels (nearest neighbour, so the blocks stay sharp). */
export function logoPng(size: number): Promise<Buffer> {
  return sharp(logoPixels(size), { raw: { width: size, height: size, channels: 4 } })
    .png()
    .toBuffer();
}

/** An .ico file with PNG images of the logo (supported since Windows Vista and by every browser). */
export async function logoIco(sizes: number[]): Promise<Buffer> {
  const images = await Promise.all(sizes.map(logoPng));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  images.forEach((png, i) => {
    const size = sizes[i]!;
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  });
  return Buffer.concat([header, ...entries, ...images]);
}

/** Sizes of the desktop icon: Windows picks the one it needs. */
export const DESKTOP_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Sizes of the browser favicon. */
export const FAVICON_SIZES = [16, 32, 48];
