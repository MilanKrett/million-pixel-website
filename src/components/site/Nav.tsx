"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "use-intl/react";
import { localePath, stripLocale, type Locale } from "@/i18n/config";

const ITEMS = [
  { key: "home", path: "/" },
  { key: "rent", path: "/rent" },
  { key: "how", path: "/how-it-works" },
  { key: "faq", path: "/faq" },
  { key: "latest", path: "/latest" },
  { key: "mine", path: "/my-pixels" },
  { key: "contact", path: "/contact" },
] as const;

/** Text links separated by "|", language switch on the right. No hamburger menu. */
export function Nav({ locale }: { locale: Locale }) {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const current = stripLocale(usePathname() ?? "/");

  return (
    <nav className="site-nav" aria-label={t("label")}>
      <ul className="nav-links">
        {ITEMS.map((item) => {
          const active = current === item.path;
          return (
            <li key={item.key}>
              <Link href={localePath(locale, item.path)} aria-current={active ? "page" : undefined} prefetch={false}>
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
      <ul className="nav-lang" aria-label={tc("language")}>
        {(["en", "sk"] as const).map((l) => (
          <li key={l}>
            {l === locale ? (
              <strong aria-current="true" lang={l}>
                {l.toUpperCase()}
              </strong>
            ) : (
              <a href={localePath(l, current)} hrefLang={l} lang={l}>
                {l.toUpperCase()}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
