import "server-only";
import { revalidateTag } from "next/cache";

/** Drop cached wall data right away (next request reads fresh data). */
export function revalidateWall(): void {
  revalidateTag("wall", { expire: 0 });
}

export function revalidateSettings(): void {
  revalidateTag("settings", { expire: 0 });
  revalidateTag("wall", { expire: 0 });
}

/** Constant-time check of "Authorization: Bearer <CRON_SECRET>". */
export function isAuthorizedInternal(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
