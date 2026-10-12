import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SpotRedirect } from "@/components/site/SpotRedirect";
import { WallCrop } from "@/components/wall/WallCrop";
import { localePath } from "@/i18n/config";
import { getFormatter, getLocale, getTranslator } from "@/i18n/server";
import { getSiteSettings, getSpot, getWallSnapshot } from "@/lib/data";
import { spotPath } from "@/lib/geometry";
import { alternates, ogLocale } from "@/lib/seo";

export const instant = false;

export async function generateMetadata({ params }: PageProps<"/[locale]/p/[no]">): Promise<Metadata> {
  const [{ no }, locale] = await Promise.all([params, getLocale()]);
  const [t, settings, spot] = await Promise.all([getTranslator(locale), getSiteSettings(), getSpot(Number(no))]);
  if (!spot) return { title: t("pages.share"), robots: { index: false } };
  const block = settings.block_size_px;
  const title = t("share.title", { title: spot.title, site: settings.site_name });
  const ogTitle = t("share.ogText", { site: settings.site_name });
  const description = t("share.description", { size: `${spot.w * block} × ${spot.h * block} px` });
  const image = { url: `/og/p/${spot.no}.png?l=${locale}`, width: 1200, height: 630, alt: spot.title, type: "image/png" };
  return {
    // The title already names the site.
    title: { absolute: title },
    description,
    // Shared links are for people; search engines index the wall itself.
    robots: { index: false, follow: true },
    alternates: alternates(locale, `/p/${spot.no}`),
    openGraph: {
      type: "website",
      siteName: settings.site_name,
      title: ogTitle,
      description: `${spot.title} — ${description}`,
      url: localePath(locale, `/p/${spot.no}`),
      locale: ogLocale(locale),
      images: [image],
    },
    twitter: { card: "summary_large_image", title: ogTitle, description: `${spot.title} — ${description}`, images: [image.url] },
  };
}

/** /p/123: the share page of a place (spec section 13). Opens the wall zoomed in on it. */
export default function SharePage({ params }: PageProps<"/[locale]/p/[no]">) {
  return (
    <div className="content">
      <Suspense fallback={<p>…</p>}>
        <Spot params={params} />
      </Suspense>
    </div>
  );
}

async function Spot({ params }: { params: PageProps<"/[locale]/p/[no]">["params"] }) {
  const [{ no }, locale] = await Promise.all([params, getLocale()]);
  const [t, format, settings, snapshot, spot] = await Promise.all([
    getTranslator(locale),
    getFormatter(locale),
    getSiteSettings(),
    getWallSnapshot(),
    getSpot(Number(no)),
  ]);
  if (!spot) {
    return (
      <>
        <h1>{t("pages.share")}</h1>
        <p>{t("share.gone")}</p>
        <p>
          <Link href={localePath(locale, "/")}>« {t("common.backToWall")}</Link>
        </p>
      </>
    );
  }
  const block = settings.block_size_px;
  const rect = { x: spot.x, y: spot.y, w: spot.w, h: spot.h };
  const wall = localePath(locale, spotPath(rect, block));
  return (
    <>
      <h1>{spot.title}</h1>
      <div className="share-spot">
        <WallCrop
          image={snapshot.image?.webp ?? null}
          wallWidth={settings.wall_width_px}
          wallHeight={settings.wall_height_px}
          block={block}
          rect={rect}
          max={200}
          label={spot.title}
        />
        <p>
          {spot.name && (
            <>
              {t("popup.by", { name: spot.name })}
              <br />
            </>
          )}
          {spot.w * block} × {spot.h * block} px
          {spot.since && (
            <>
              <br />
              {t("popup.since", { date: format.dateTime(new Date(spot.since), { dateStyle: "medium" }) })}
            </>
          )}
        </p>
      </div>
      <p>
        <Link className="btn" href={wall}>
          {t("share.see")}
        </Link>
      </p>
      <SpotRedirect href={wall} label={t("share.redirecting")} />
    </>
  );
}
