import { createTranslator } from "use-intl/core";
import { DEFAULT_LOCALE, intlLocale, isLocale, TIME_ZONE } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getSiteSettings, getSpot } from "@/lib/data";
import { db } from "@/lib/db";
import { spotOgImage } from "@/lib/og";

/**
 * /og/p/123.png?l=<language>: the picture shown when someone shares the page
 * of place no. 123 — the wall around it, enlarged, with "I have my own spot
 * on …!" below.
 */
export async function GET(request: Request, ctx: RouteContext<"/og/p/[file]">) {
  const { file } = await ctx.params;
  const match = /^(\d{1,9})\.png$/.exec(file);
  const spot = match ? await getSpot(Number(match[1])) : null;
  if (!spot) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });

  const param = new URL(request.url).searchParams.get("l");
  const locale = isLocale(param) ? param : DEFAULT_LOCALE;
  const settings = await getSiteSettings();
  const t = createTranslator({ locale: intlLocale(locale), messages: getMessages(locale), timeZone: TIME_ZONE });
  const png = await spotOgImage(db(), settings, spot, t("share.ogText", { site: settings.site_name }), spot.title);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
