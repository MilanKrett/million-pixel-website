/**
 * `npm run logo`: writes the icon files made from the logo (src/lib/logo.ts):
 * src/app/icon.svg and src/app/favicon.ico for browsers, and
 * scripts/desktop/icon.ico for the desktop icon. Run it after changing the logo;
 * a unit test checks that icon.svg matches.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { logoSvg } from "@/lib/logo";
import { DESKTOP_ICON_SIZES, FAVICON_SIZES, logoIco } from "./lib/icon";

async function main(): Promise<void> {
  const files: [string, Buffer | string][] = [
    ["src/app/icon.svg", logoSvg()],
    ["src/app/favicon.ico", await logoIco(FAVICON_SIZES)],
    ["scripts/desktop/icon.ico", await logoIco(DESKTOP_ICON_SIZES)],
  ];
  for (const [file, data] of files) {
    writeFileSync(path.resolve(file), data);
    console.log(`✓ ${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
