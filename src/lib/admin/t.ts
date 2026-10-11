import { createTranslator } from "use-intl/core";
import { getMessages, intlLocale, TIME_ZONE, type Locale } from "@/i18n/config";

/** Translator for admin pages in the staff member's language. */
export function adminT(locale: Locale) {
  return createTranslator({ locale: intlLocale(locale), messages: getMessages(locale), timeZone: TIME_ZONE, namespace: "admin" });
}

/** Names of the content rules (report categories, decision reasons). */
export function reasonsT(locale: Locale) {
  return createTranslator({ locale: intlLocale(locale), messages: getMessages(locale), timeZone: TIME_ZONE, namespace: "reasons" });
}

export function adminFormat(locale: Locale) {
  const il = intlLocale(locale);
  return {
    date: (d: Date | null) => (d ? new Intl.DateTimeFormat(il, { dateStyle: "medium", timeZone: TIME_ZONE }).format(d) : "—"),
    dateTime: (d: Date | null) => (d ? new Intl.DateTimeFormat(il, { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE }).format(d) : "—"),
    number: (n: number) => new Intl.NumberFormat(il).format(n),
    percent: (n: number) => new Intl.NumberFormat(il, { maximumFractionDigits: 1 }).format(n),
  };
}
