"use client";

import { useTranslations } from "use-intl/react";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";

export default function NotFound() {
  const t = useTranslations();
  const locale = useAppLocale();
  return (
    <div className="content">
      <h1>{t("pages.notFoundTitle")}</h1>
      <p>{t("pages.notFoundText")}</p>
      <p>
        <a href={localePath(locale, "/")}>« {t("common.backToWall")}</a>
      </p>
    </div>
  );
}
