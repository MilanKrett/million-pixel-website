/**
 * `npm run desktop:install`: puts a "Million Pixel Website" icon on the desktop
 * (Windows) that starts the site on this computer (scripts/desktop/start.cmd).
 * The icon picture is the logo, written to scripts/desktop/icon.ico.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DESKTOP_ICON_SIZES, logoIco } from "./lib/icon";

const NAME = "Million Pixel Website";
// Shortcuts made by older versions; replaced by the new one.
const OLD_NAMES = ["Million Pixel Wall"];

async function main(): Promise<void> {
  const dir = path.resolve("scripts/desktop");
  mkdirSync(dir, { recursive: true });
  const icon = path.join(dir, "icon.ico");
  writeFileSync(icon, await logoIco(DESKTOP_ICON_SIZES));
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
    ...OLD_NAMES.map((old) => `Remove-Item -LiteralPath (Join-Path $desktop ${quote(`${old}.lnk`)}) -ErrorAction SilentlyContinue`),
    `$link = $ws.CreateShortcut((Join-Path $desktop ${quote(`${NAME}.lnk`)}))`,
    `$link.TargetPath = ${quote(target)}`,
    `$link.WorkingDirectory = ${quote(path.resolve("."))}`,
    `$link.IconLocation = ${quote(`${icon},0`)}`,
    `$link.Description = ${quote(`${NAME} on this computer`)}`,
    "$link.Save()",
    `Write-Output (Join-Path $desktop ${quote(`${NAME}.lnk`)})`,
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
