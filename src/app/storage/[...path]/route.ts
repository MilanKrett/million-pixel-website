import { storage } from "@/lib/storage";

const TYPES: Record<string, string> = { png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" };

/**
 * Development only: serves the public "wall" bucket from .data/storage.
 * In production the images come straight from Supabase Storage.
 */
export async function GET(_request: Request, ctx: RouteContext<"/storage/[...path]">) {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") return new Response("Not found", { status: 404 });
  const { path } = await ctx.params;
  if (path[0] !== "wall" || path.length < 2) return new Response("Not found", { status: 404 });

  let file: Buffer | null = null;
  try {
    file = await storage().get("wall", path.slice(1).join("/"));
  } catch {
    file = null;
  }
  if (!file) return new Response("Not found", { status: 404 });

  const ext = path[path.length - 1].split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
