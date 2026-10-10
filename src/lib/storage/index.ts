import { localStorageDriver } from "./local";
import { supabaseStorageDriver } from "./supabase";
import type { StorageDriver } from "./types";

export { safeStoragePath, type Bucket, type PutOptions, type StorageDriver } from "./types";

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER ?? "local";
  if (kind === "supabase") {
    driver = supabaseStorageDriver();
  } else if (kind === "local") {
    if (process.env.APP_ENV === "production" || process.env.VERCEL) {
      throw new Error("STORAGE_DRIVER=local cannot be used in production. Set STORAGE_DRIVER=supabase.");
    }
    driver = localStorageDriver();
  } else {
    throw new Error(`Unknown STORAGE_DRIVER "${kind}"`);
  }
  return driver;
}
