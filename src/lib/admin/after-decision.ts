import "server-only";
import { db } from "@/lib/db";
import { revalidateWall } from "@/lib/revalidate";
import { renderWall } from "@/lib/wall/render";

/** After a decision that changes what the wall shows: redraw now and drop cached wall data. */
export async function refreshWall(): Promise<void> {
  await renderWall(db());
  revalidateWall();
}
