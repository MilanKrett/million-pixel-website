"use client";

import Link from "next/link";
import { useTranslations } from "use-intl/react";
import { PixelText } from "@/components/site/PixelText";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";

/** The retro 404 page (spec section 13). */
export default function NotFound() {
  const t = useTranslations();
  const locale = useAppLocale();
  return (
    <div className="content">
      <PixelText text="404" scale={10} className="not-found-art" />
      <h1>{t("pages.notFoundTitle")}</h1>
      <p>{t("pages.notFoundText")}</p>
      <p>
        <Link href={localePath(locale, "/")}>« {t("common.backToWall")}</Link> ·{" "}
        <Link href={localePath(locale, "/buy")}>{t("nav.rent")}</Link>
      </p>
    </div>
  );
}
