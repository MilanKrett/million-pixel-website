import type en from "@/messages/en.json";

/**
 * Languages of the public site. English is the main language (no URL
 * prefix), the others live under "/<code>". Message files are loaded by
 * ./messages.ts (server); this module stays small enough for the browser.
 */
export const LOCALES = ["en", "sk", "cs", "de", "pl", "hu", "fr", "es", "it", "pt"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const TIME_ZONE = "Europe/Bratislava";

/** The administration is only in English and Slovak. */
export const ADMIN_LOCALES = ["en", "sk"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];

/** Cookie with the language a visitor picked in the language switch. */
export const LANGUAGE_COOKIE = "pw_lang";

export type Messages = typeof en;
export type Namespace = keyof Messages;

/** Each language's name in that language (language switch, admin). */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  sk: "Slovenčina",
  cs: "Čeština",
  de: "Deutsch",
  pl: "Polski",
  hu: "Magyar",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  pt: "Português",
};

/** BCP 47 tags used for number and date formatting. */
const INTL_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  sk: "sk-SK",
  cs: "cs-CZ",
  de: "de-DE",
  pl: "pl-PL",
  hu: "hu-HU",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  pt: "pt-PT",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function intlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}

/** Language of the admin for a staff member whose account language may be any site language. */
export function adminLocale(locale: string | null | undefined): AdminLocale {
  return locale === "sk" ? "sk" : "en";
}

/** Path for a locale: "/faq" → "/faq" (en) or "/sk/faq". Keeps the query string. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : clean.startsWith("/?") ? `/${locale}${clean.slice(1)}` : `/${locale}${clean}`;
}

const PREFIX = new RegExp(`^/(${LOCALES.join("|")})(?=/|$)`);

/** Remove a locale prefix: "/sk/faq" → "/faq", "/de" → "/". */
export function stripLocale(pathname: string): string {
  const match = pathname.match(PREFIX);
  if (!match) return pathname || "/";
  return pathname.slice(match[0].length) || "/";
}

/** The locale a path belongs to ("/de/faq" → "de", "/faq" → "en"). */
export function localeOfPath(pathname: string): Locale {
  const match = pathname.match(PREFIX);
  return match && isLocale(match[1]) ? match[1] : DEFAULT_LOCALE;
}

/**
 * The best of our languages for an Accept-Language header
 * ("de-AT,de;q=0.9,en;q=0.8" → "de"), or null when none of them is wanted.
 */
export function matchLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const wanted = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { lang: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((w) => w.lang && w.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const w of wanted) if (isLocale(w.lang)) return w.lang;
  return null;
}
