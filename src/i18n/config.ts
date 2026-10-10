import en from "@/messages/en.json";
import sk from "@/messages/sk.json";

/** English is the main language (no URL prefix), Slovak lives under /sk. */
export const LOCALES = ["en", "sk"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const TIME_ZONE = "Europe/Bratislava";

export type Messages = typeof en;

const MESSAGES: Record<Locale, Messages> = { en, sk };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** BCP 47 tag used for number and date formatting. */
export function intlLocale(locale: Locale): string {
  return locale === "sk" ? "sk-SK" : "en-GB";
}

/** Path for a locale: "/faq" → "/faq" (en) or "/sk/faq" (sk). Keeps the query string. */
export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : clean.startsWith("/?") ? `/${locale}${clean.slice(1)}` : `/${locale}${clean}`;
}

/** Remove a locale prefix: "/sk/faq" → "/faq", "/sk" → "/". */
export function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/(en|sk)(?=\/|$)/);
  if (!match) return pathname || "/";
  return pathname.slice(match[0].length) || "/";
}
