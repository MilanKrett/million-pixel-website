import { after, type NextRequest } from "next/server";
import { isBot } from "@/lib/bots";
import { db } from "@/lib/db";

/** Counts how often a rental's window was opened on the wall (statistics for renters). */
export async function POST(request: NextRequest) {
  const number = Number(request.nextUrl.searchParams.get("no"));
  if (!Number.isSafeInteger(number) || number <= 0 || isBot(request.headers.get("user-agent"))) {
    return new Response(null, { status: 204 });
  }
  after(async () => {
    await db()`
      insert into click_stats (rental_id, day, opens)
      select r.id, (now() at time zone 'Europe/Bratislava')::date, 1
      from rentals r
      where r.no = ${number} and rental_is_displayed(r.status, r.hidden_at, r.active_content_id)
      on conflict (rental_id, day) do update set opens = click_stats.opens + 1
    `;
  });
  return new Response(null, { status: 204 });
}
