import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { MobileRentButton } from "@/components/site/MobileRentButton";
import { Nav } from "@/components/site/Nav";
import { intlLocale, LOCALES } from "@/i18n/config";
import { BASE_NAMESPACES, pickMessages } from "@/i18n/messages";
import { I18nProvider } from "@/i18n/provider";
import { getLocale, getTranslator } from "@/i18n/server";
import { analyticsConfig } from "@/lib/analytics";
import { getSiteSettings } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { ogLocale, wallOgImage } from "@/lib/seo";
import "../globals.css";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const [settings, t] = await Promise.all([getSiteSettings(), getTranslator(locale)]);
  const pixels = settings.wall_width_px * settings.wall_height_px;
  const price = formatMoney(settings.price_cents_per_pixel, settings.currency, intlLocale(locale));
  const title = t("meta.title", { site: settings.site_name, pixels });
  const description = t("meta.description", { pixels, price });
  const image = wallOgImage(locale, t("wall.imageAlt", { pixels }));
  return {
    metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
    title: { default: title, template: `%s — ${settings.site_name}` },
    description,
    applicationName: settings.site_name,
    formatDetection: { telephone: false },
    // Pages with their own title replace these (see lib/seo.ts).
    openGraph: { type: "website", siteName: settings.site_name, title, description, locale: ogLocale(locale), images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await getLocale();
  const t = await getTranslator(locale);
  const analytics = analyticsConfig();

  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main">
          {t("common.skipToContent")}
        </a>
        <I18nProvider locale={locale} messages={pickMessages(locale, BASE_NAMESPACES)}>
          <div className="page">
            <Header locale={locale} />
            <Nav locale={locale} />
            <main id="main">{children}</main>
            <Footer locale={locale} />
          </div>
          <MobileRentButton locale={locale} />
        </I18nProvider>
        {/* Visit statistics without cookies, only when configured (lib/analytics.ts). */}
        {analytics && <Script src={analytics.src} strategy="afterInteractive" {...analytics.attributes} />}
      </body>
    </html>
  );
}
