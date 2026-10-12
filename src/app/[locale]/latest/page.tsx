import Link from "next/link";
import { Suspense } from "react";
import { WallCrop } from "@/components/wall/WallCrop";
import { localePath } from "@/i18n/config";
import { getFormatter, getLocale, getTranslator } from "@/i18n/server";
import { getLatestSpots, getSiteSettings, getWallSnapshot } from "@/lib/data";
import { spotPath } from "@/lib/geometry";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata("latest", "/latest");

/** The 50 newest places on the wall (spec section 13). A click opens the wall right there. */
export default async function LatestPage() {
  const t = await getTranslator();
  return (
    <div className="content wide">
      <h1>{t("pages.latest")}</h1>
      <p>{t("latest.intro")}</p>
      <Suspense fallback={<p>…</p>}>
        <LatestList />
      </Suspense>
    </div>
  );
}

async function LatestList() {
  const locale = await getLocale();
  const [t, format, settings, snapshot, spots] = await Promise.all([
    getTranslator(locale),
    getFormatter(locale),
    getSiteSettings(),
    getWallSnapshot(),
    getLatestSpots(),
  ]);
  if (!spots.length) {
    return (
      <p>
        {t("latest.empty")}{" "}
        <Link className="btn btn-rent" href={localePath(locale, "/buy")}>
          {t("nav.rent")}
        </Link>
      </p>
    );
  }
  const block = settings.block_size_px;
  return (
    <ul className="latest">
      {spots.map((s) => {
        const rect = { x: s.x, y: s.y, w: s.w, h: s.h };
        return (
          <li key={s.no}>
            <Link href={localePath(locale, spotPath(rect, block))} className="latest-link">
              <span className="latest-preview">
                <WallCrop
                  image={snapshot.image?.webp ?? null}
                  wallWidth={settings.wall_width_px}
                  wallHeight={settings.wall_height_px}
                  block={block}
                  rect={rect}
                  max={100}
                  label={s.title}
                />
              </span>
              <span className="latest-title">{s.title}</span>
            </Link>
            <span className="latest-meta small muted">
              {s.name && <>{t("popup.by", { name: s.name })} · </>}
              {s.w * block} × {s.h * block} px
              {s.since && <> · {t("latest.since", { date: format.dateTime(new Date(s.since), { dateStyle: "medium" }) })}</>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
