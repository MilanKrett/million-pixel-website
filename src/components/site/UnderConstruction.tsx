"use client";

import { useTranslations } from "use-intl/react";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";

export type PageKey = "rent" | "how" | "faq" | "latest" | "mine" | "contact" | "rules" | "terms" | "privacy" | "report";

/** Placeholder for pages that are built in a later phase of the project. */
export function UnderConstruction({ page, phase }: { page: PageKey; phase: number }) {
  const t = useTranslations();
  const locale = useAppLocale();
  return (
    <div className="content">
      <h1>{t(`pages.${page}`)}</h1>
      <div className="notice">
        <p>
          <b>{t("pages.underConstruction")}</b> {t("pages.comingInPhase", { phase })}
        </p>
      </div>
      <p>
        <a href={localePath(locale, "/")}>« {t("common.backToWall")}</a>
      </p>
    </div>
  );
}
