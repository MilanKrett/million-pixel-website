import { verifyUpload } from "@/lib/signing";
import { storage, type Bucket } from "@/lib/storage";

/**
 * Development only: receives a direct upload signed by the local storage
 * driver (in production the browser uploads straight to Supabase Storage).
 */
export async function PUT(request: Request) {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") return new Response("Not found", { status: 404 });
  const grant = verifyUpload(new URL(request.url).searchParams);
  if (!grant || (grant.bucket !== "content" && grant.bucket !== "wall")) return new Response("Forbidden", { status: 403 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > grant.maxBytes) return new Response("Too large", { status: 413 });
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0) return new Response("Empty", { status: 400 });
  if (data.length > grant.maxBytes) return new Response("Too large", { status: 413 });

  await storage().put(grant.bucket as Bucket, grant.path, data, { contentType: grant.contentType });
  return new Response(null, { status: 204 });
}
