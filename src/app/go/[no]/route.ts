import { after, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, localePath, matchLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { isBot } from "@/lib/bots";
import { db } from "@/lib/db";
import { normalizeUrl } from "@/lib/url";

/**
 * /go/123 — redirects to the renter's link and counts the click. All outgoing
 * links from the wall go through here, so a link removed by a moderator stops
 * working immediately, everywhere. A link flagged as dangerous shows a
 * warning instead of redirecting.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[no]">) {
  const { no } = await ctx.params;
  const number = Number(no);
  const home = new URL("/", request.url);
  if (!Number.isSafeInteger(number) || number <= 0) return Response.redirect(home, 302);

  const [row] = await db()<{ id: string; url: string | null; flagged: boolean }[]>`
    select r.id, c.url, c.link_flagged_at is not null as flagged
    from rentals r
    join content_versions c on c.id = r.active_content_id
    where r.no = ${number} and rental_is_displayed(r.status, r.hidden_at, r.active_content_id)
  `;
  const target = row?.url ? normalizeUrl(row.url) : null;
  if (!row || !target) return Response.redirect(home, 302);
  if (row.flagged) return warningPage(target, matchLocale(request.headers.get("accept-language")) ?? DEFAULT_LOCALE);

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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain page in the visitor's language; the address is shown as text, not as a link. */
function warningPage(target: string, locale: Locale): Response {
  const t = getMessages(locale).goWarning;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="robots" content="noindex"><title>${esc(t.title)}</title></head>
<body style="font:13px/1.5 Verdana,Tahoma,Arial,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;background:#fff;color:#000;">
<h1 style="font-size:16px;">${esc(t.title)}</h1>
<p>${esc(t.text)}</p>
<p style="color:#555;word-break:break-all;">${esc(t.address)} ${esc(target)}</p>
<p><a href="${esc(localePath(locale, "/"))}" style="color:#0000ee;">« ${esc(t.back)}</a></p>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
