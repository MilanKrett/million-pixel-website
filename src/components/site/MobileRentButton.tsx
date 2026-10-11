"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "use-intl/react";
import { localePath, stripLocale, type Locale } from "@/i18n/config";

/** "Rent pixels" pinned to the bottom of the screen on phones. */
export function MobileRentButton({ locale }: { locale: Locale }) {
  const t = useTranslations("nav");
  const path = stripLocale(usePathname() ?? "/");
  if (path.startsWith("/buy")) return null;
  return (
    <div className="rent-sticky">
      <a className="btn btn-rent" href={localePath(locale, "/buy")}>
        {t("rent")}
      </a>
    </div>
  );
}
