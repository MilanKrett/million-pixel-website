import "server-only";
import { locale as rootLocale } from "next/root-params";
import { createFormatter, createTranslator } from "use-intl/core";
import { DEFAULT_LOCALE, intlLocale, isLocale, TIME_ZONE, type Locale } from "./config";
import { getMessages } from "./messages";

/**
 * Locale of the current route (the [locale] root segment). The proxy only
 * routes to known languages; anything else (e.g. a build-time placeholder)
 * falls back to English.
 */
export async function getLocale(): Promise<Locale> {
  const value = await rootLocale();
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getTranslator(locale?: Locale) {
  const l = locale ?? (await getLocale());
  return createTranslator({ locale: intlLocale(l), messages: getMessages(l), timeZone: TIME_ZONE });
}

export async function getFormatter(locale?: Locale) {
  const l = locale ?? (await getLocale());
  return createFormatter({ locale: intlLocale(l), timeZone: TIME_ZONE });
}
