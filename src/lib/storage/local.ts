import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeStoragePath, type Bucket, type StorageDriver } from "./types";

/** Development driver: files in .data/storage, served by /storage/[...path]. */
export function localStorageDriver(): StorageDriver {
  // Development only, so the bundler must not try to trace these paths into the build.
  const root = path.resolve(/*turbopackIgnore: true*/ process.env.LOCAL_STORAGE_DIR ?? ".data/storage");
  const resolve = (bucket: Bucket, p: string) =>
    path.join(/*turbopackIgnore: true*/ root, bucket, ...safeStoragePath(p).split("/"));

  return {
    async put(bucket, p, data) {
      const file = resolve(bucket, p);
      await mkdir(path.dirname(file), { recursive: true });
      // Write to a temp file first so readers never see a half-written image.
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, file);
    },
    async get(bucket, p) {
      try {
        return await readFile(resolve(bucket, p));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async remove(bucket, paths) {
      await Promise.all(paths.map((p) => rm(resolve(bucket, p), { force: true })));
    },
    publicUrl(bucket, p) {
      return `/storage/${bucket}/${safeStoragePath(p)}`;
    },
  };
}
