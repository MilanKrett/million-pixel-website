import { createTranslator } from "use-intl/core";
import { DEFAULT_LOCALE, intlLocale, isLocale, TIME_ZONE } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getSiteSettings, getWallStats } from "@/lib/data";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { wallOgImage } from "@/lib/og";

/**
 * The picture of the current wall shown when someone shares the site
 * (1200 × 630 PNG, ?l=<language>). Caches keep it for a day, so social
 * networks get a fresh wall daily.
 */
export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get("l");
  const locale = isLocale(param) ? param : DEFAULT_LOCALE;
  const [settings, stats] = await Promise.all([getSiteSettings(), getWallStats()]);
  const t = createTranslator({ locale: intlLocale(locale), messages: getMessages(locale), timeZone: TIME_ZONE });
  const price =
    settings.price_cents_per_pixel < 100
      ? t("common.pricePerPixel", { cents: settings.price_cents_per_pixel })
      : t("common.pricePerPixelMoney", { price: formatMoney(settings.price_cents_per_pixel, settings.currency, intlLocale(locale)) });
  const percent = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 1 }).format(
    stats.totalPixels ? stats.rentedPixels / stats.totalPixels : 0,
  );
  const png = await wallOgImage(
    db(),
    settings,
    settings.site_name,
    [t("common.pixels", { count: stats.totalPixels }), price, settings.tagline[locale] || t("header.slogan")],
    t("header.progress", { percent }),
  );
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
