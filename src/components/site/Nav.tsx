"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "use-intl/react";
import { LANGUAGE_COOKIE, LOCALE_NAMES, LOCALES, localePath, stripLocale, type Locale } from "@/i18n/config";

const ITEMS = [
  { key: "home", path: "/" },
  { key: "rent", path: "/rent" },
  { key: "how", path: "/how-it-works" },
  { key: "faq", path: "/faq" },
  { key: "latest", path: "/latest" },
  { key: "mine", path: "/my-pixels" },
  { key: "contact", path: "/contact" },
] as const;

/** Remember an explicit choice, so the home page no longer follows the browser's language. */
function rememberLanguage(locale: Locale) {
  try {
    document.cookie = `${LANGUAGE_COOKIE}=${locale}; path=/; max-age=${365 * 86400}; samesite=lax`;
  } catch {
    // Cookies blocked: the switch still works, the choice is just not remembered.
  }
}

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
        {LOCALES.map((l) => (
          <li key={l}>
            {l === locale ? (
              <strong aria-current="true" lang={l} title={LOCALE_NAMES[l]}>
                {l.toUpperCase()}
              </strong>
            ) : (
              <a href={localePath(l, current)} hrefLang={l} lang={l} title={LOCALE_NAMES[l]} onClick={() => rememberLanguage(l)}>
                {l.toUpperCase()}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
