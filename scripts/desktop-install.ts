/**
 * `npm run desktop:install`: puts a "Million Pixel Wall" icon on the desktop
 * (Windows) that starts the site on this computer (scripts/desktop/start.cmd).
 * The icon picture is the logo, written to scripts/desktop/icon.ico.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

// The 4 × 4 logo (components/site/LogoMark.tsx).
const COLORS = [
  "#e8590c", "#f4f4f4", "#1971c2", "#2f9e44",
  "#f4f4f4", "#f59f00", "#e8590c", "#f4f4f4",
  "#7048e8", "#e8590c", "#f4f4f4", "#1971c2",
  "#2f9e44", "#f4f4f4", "#f59f00", "#e8590c",
];

const SIZES = [16, 24, 32, 48, 64, 128, 256];

function logoSvg(): string {
  const cells = COLORS.map((fill, i) => `<rect x="${(i % 4) * 8}" y="${Math.floor(i / 4) * 8}" width="8" height="8" fill="${fill}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">${cells}<rect x="0.5" y="0.5" width="31" height="31" fill="none" stroke="#999999"/></svg>`;
}

/** An .ico file with PNG images (supported since Windows Vista). */
async function iconFile(): Promise<Buffer> {
  const svg = Buffer.from(logoSvg());
  const images = await Promise.all(SIZES.map((size) => sharp(svg, { density: 72 * (size / 32) * 4 }).resize(size, size, { kernel: "nearest" }).png().toBuffer()));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  images.forEach((png, i) => {
    const size = SIZES[i]!;
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

async function main(): Promise<void> {
  const dir = path.resolve("scripts/desktop");
  mkdirSync(dir, { recursive: true });
  const icon = path.join(dir, "icon.ico");
  writeFileSync(icon, await iconFile());
  console.log(`✓ Icon: ${icon}`);

  if (process.platform !== "win32") {
    console.log("• The desktop icon is made for Windows. Elsewhere run: npm run desktop");
    return;
  }
  const target = path.join(dir, "start.cmd");
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const script = [
    "$ws = New-Object -ComObject WScript.Shell",
    "$desktop = [Environment]::GetFolderPath('Desktop')",
    "$link = $ws.CreateShortcut((Join-Path $desktop 'Million Pixel Wall.lnk'))",
    `$link.TargetPath = ${quote(target)}`,
    `$link.WorkingDirectory = ${quote(path.resolve("."))}`,
    `$link.IconLocation = ${quote(`${icon},0`)}`,
    "$link.Description = 'Million Pixel Wall on this computer'",
    "$link.Save()",
    "Write-Output (Join-Path $desktop 'Million Pixel Wall.lnk')",
  ].join("; ");
  const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  console.log(`✓ Desktop icon: ${result.stdout.trim()}`);
  console.log("  Double-click it to start the site; close its window to stop it.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
