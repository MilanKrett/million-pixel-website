import { pruneSessions } from "@/lib/auth/session";
import { pruneContactMessages } from "@/lib/contact";
import type { Sql } from "@/lib/db";
import { notifyRefunded } from "@/lib/orders/notify";
import { refundRental } from "@/lib/payments/refund";
import { pruneRateLimits } from "@/lib/rate-limit";

/**
 * Rentals whose first content was rejected and no new content arrived before
 * the deadline: the whole payment goes back and the space is freed.
 */
export async function refundMissedReuploads(sql: Sql, limit = 50): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    select id from rentals where status = 'rejected' and reupload_until < now() order by reupload_until limit ${limit}
  `;
  let refunded = 0;
  for (const row of rows) {
    try {
      const result = await refundRental(sql, row.id, { endRental: true, actor: { id: null, label: "system" }, cause: "no_reupload" });
      if (result.ok) {
        refunded++;
        await notifyRefunded(sql, row.id, { cause: "no_reupload", refundCents: result.refundedCents });
      } else if (result.reason === "nothing_to_refund") {
        // Paid nothing (e.g. created by an admin): just free the space.
        await sql`update rentals set status = 'refunded', reupload_until = null where id = ${row.id} and status = 'rejected'`;
      }
    } catch (error) {
      console.error(`[jobs] refund of rental ${row.id} failed:`, error);
    }
  }
  return refunded;
}

/** Old sessions, sign-in links, request counters and handled contact messages. */
export async function pruneOldRows(sql: Sql): Promise<void> {
  await pruneSessions(sql);
  await pruneRateLimits(sql);
  await pruneContactMessages(sql);
}
