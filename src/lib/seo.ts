import "server-only";
import type { Metadata } from "next";
import { DEFAULT_LOCALE, intlLocale, LOCALES, localePath, type Locale } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { getSiteSettings } from "@/lib/data";
import { formatMoney } from "@/lib/money";

/**
 * Titles, descriptions, language versions (hreflang) and social previews
 * (Open Graph) of the public pages.
 */

export type PageKey = "buy" | "how" | "faq" | "latest" | "contact" | "rules" | "terms" | "complaints" | "privacy" | "report";

const TITLES = {
  buy: "rent",
  how: "how",
  faq: "faq",
  latest: "latest",
  contact: "contact",
  rules: "rules",
  terms: "terms",
  complaints: "complaints",
  privacy: "privacy",
  report: "report",
} as const satisfies Record<PageKey, string>;

/** The page in every language, plus the canonical address of this language version. */
export function alternates(locale: Locale, path: string): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)]));
  languages["x-default"] = localePath(DEFAULT_LOCALE, path);
  return { canonical: localePath(locale, path), languages };
}

/** Picture of the current wall for social networks (refreshed daily). */
export function wallOgImage(locale: Locale, alt: string) {
  return { url: `/og/wall.png?l=${locale}`, width: 1200, height: 630, alt, type: "image/png" };
}

export function ogLocale(locale: Locale): string {
  return intlLocale(locale).replace("-", "_");
}

export async function pageMetadata(key: PageKey, path: string): Promise<Metadata> {
  const locale = await getLocale();
  const [t, settings] = await Promise.all([getTranslator(locale), getSiteSettings()]);
  const title = t(`pages.${TITLES[key]}`);
  const description = t(`meta.pages.${key}`, {
    site: settings.site_name,
    price: formatMoney(settings.price_cents_per_pixel, settings.currency, intlLocale(locale)),
  });
  const image = wallOgImage(locale, t("wall.imageAlt", { pixels: settings.wall_width_px * settings.wall_height_px }));
  return {
    title,
    description,
    alternates: alternates(locale, path),
    openGraph: {
      type: "website",
      siteName: settings.site_name,
      title,
      description,
      url: localePath(locale, path),
      locale: ogLocale(locale),
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
