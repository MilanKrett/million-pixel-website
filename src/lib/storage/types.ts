/**
 * File storage.
 *  - "wall"    public bucket: versioned wall images (immutable, cached forever)
 *  - "content" private bucket: renters' original uploads and final tile PNGs
 */
export type Bucket = "wall" | "content";

export interface PutOptions {
  contentType: string;
  /** Seconds; immutable files (versioned names) should use a year. */
  cacheSeconds?: number;
}

export interface StorageDriver {
  put(bucket: Bucket, path: string, data: Buffer, options: PutOptions): Promise<void>;
  /** Returns null when the file does not exist. */
  get(bucket: Bucket, path: string): Promise<Buffer | null>;
  remove(bucket: Bucket, paths: string[]): Promise<void>;
  /** Public URL of a file in the public "wall" bucket. */
  publicUrl(bucket: "wall", path: string): string;
}

/** Normalise and validate a storage path (no "..", no backslashes, no leading slash). */
export function safeStoragePath(path: string): string {
  const parts = path.split("/").filter((p) => p.length > 0);
  if (parts.length === 0 || parts.some((p) => p === "." || p === ".." || p.includes("\\") || p.includes("\u0000"))) {
    throw new Error(`Invalid storage path: ${path}`);
  }
  return parts.join("/");
}
