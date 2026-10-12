import { Suspense } from "react";
import { intlLocale, localePath, type Locale } from "@/i18n/config";
import { getTranslator } from "@/i18n/server";
import { getSiteSettings, getWallStats } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { LogoMark } from "./LogoMark";
import { StatsBox } from "./StatsBox";

export async function Header({ locale }: { locale: Locale }) {
  const [settings, t] = await Promise.all([getSiteSettings(), getTranslator(locale)]);
  const totalPixels = settings.wall_width_px * settings.wall_height_px;
  const slogan = settings.tagline[locale] || t("header.slogan");
  const announcement = settings.announcement[locale] || settings.announcement.en || "";
  const price =
    settings.price_cents_per_pixel < 100
      ? t("common.pricePerPixel", { cents: settings.price_cents_per_pixel })
      : t("common.pricePerPixelMoney", {
          price: formatMoney(settings.price_cents_per_pixel, settings.currency, intlLocale(locale)),
        });

  return (
    <header className="site-header">
      {announcement && (
        <p className="announcement" role="note">
          {announcement}
        </p>
      )}
      <div className="site-header-row">
        <div className="brand">
          <a className="logo" href={localePath(locale, "/")} title={t("header.logoTitle", { site: settings.site_name })}>
            <LogoMark />
            <span className="logo-name">{settings.site_name}</span>
          </a>
          <p className="tagline">
            <span>{t("common.pixels", { count: totalPixels })}</span>
            <span className="dot"> • </span>
            <span>{price}</span>
            {slogan && (
              <>
                <span className="dot"> • </span>
                <span>{slogan}</span>
              </>
            )}
          </p>
        </div>
        <Suspense fallback={<div className="stats stats-placeholder" aria-hidden="true" />}>
          <Stats />
        </Suspense>
      </div>
    </header>
  );
}

/** Counters change all the time, so they stream in after the rest of the header. */
async function Stats() {
  const stats = await getWallStats();
  return <StatsBox initial={stats} />;
}
