import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Load environment files the same way Next.js does for local development
 * (.env.local first, then .env). Variables already set in the shell win.
 */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(file);
    if (existsSync(full)) process.loadEnvFile(full);
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n✖ ${name} is not set. Copy .env.example to .env.local (see README).\n`);
    process.exit(1);
  }
  return value;
}

export function isProduction(): boolean {
  return process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production";
}
