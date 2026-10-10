import { safeStoragePath, type StorageDriver } from "./types";

/**
 * Supabase Storage over its REST API (server only: uses the secret key).
 * Buckets: "wall" (public) and "content" (private) must exist; see README.
 */
export function supabaseStorageDriver(): StorageDriver {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) {
    throw new Error("STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  // Legacy service_role keys are JWTs and go into Authorization; the newer
  // sb_secret_ keys are accepted in the apikey header only.
  const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    ...extra,
  });
  const objectUrl = (bucket: string, p: string) =>
    `${baseUrl}/storage/v1/object/${bucket}/${safeStoragePath(p).split("/").map(encodeURIComponent).join("/")}`;

  return {
    async put(bucket, p, data, options) {
      const res = await fetch(objectUrl(bucket, p), {
        method: "POST",
        headers: headers({
          "Content-Type": options.contentType,
          "cache-control": `max-age=${options.cacheSeconds ?? 3600}`,
          "x-upsert": "true",
        }),
        body: new Uint8Array(data),
      });
      if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${await res.text()}`);
    },
    async get(bucket, p) {
      const res = await fetch(objectUrl(bucket, p), { headers: headers(), cache: "no-store" });
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error(`Storage download failed (${res.status}): ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(bucket, paths) {
      if (paths.length === 0) return;
      const res = await fetch(`${baseUrl}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: paths.map(safeStoragePath) }),
      });
      if (!res.ok) throw new Error(`Storage delete failed (${res.status}): ${await res.text()}`);
    },
    publicUrl(bucket, p) {
      return `${baseUrl}/storage/v1/object/public/${bucket}/${safeStoragePath(p)}`;
    },
  };
}
