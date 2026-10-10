import { after, type NextRequest } from "next/server";
import { isBot } from "@/lib/bots";
import { db } from "@/lib/db";
import { normalizeUrl } from "@/lib/url";

/**
 * /go/123 — redirects to the renter's link and counts the click. All outgoing
 * links from the wall go through here, so a link removed by a moderator stops
 * working immediately, everywhere.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[no]">) {
  const { no } = await ctx.params;
  const number = Number(no);
  const home = new URL("/", request.url);
  if (!Number.isSafeInteger(number) || number <= 0) return Response.redirect(home, 302);

  const [row] = await db()<{ id: string; url: string | null }[]>`
    select r.id, c.url
    from rentals r
    join content_versions c on c.id = r.active_content_id
    where r.no = ${number} and rental_is_displayed(r.status, r.hidden_at, r.active_content_id)
  `;
  const target = row?.url ? normalizeUrl(row.url) : null;
  if (!row || !target) return Response.redirect(home, 302);

  if (!isBot(request.headers.get("user-agent"))) {
    after(async () => {
      await db()`
        insert into click_stats (rental_id, day, clicks)
        values (${row.id}, (now() at time zone 'Europe/Bratislava')::date, 1)
        on conflict (rental_id, day) do update set clicks = click_stats.clicks + 1
      `;
    });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
