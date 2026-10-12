import { createTranslator } from "use-intl/core";
import { adminLocale, intlLocale, TIME_ZONE } from "@/i18n/config";
import { getAdminMessages } from "@/i18n/messages";

/**
 * Translator for admin pages. The admin is in English or Slovak; a staff
 * member whose account language is another site language gets English.
 */
export function adminT(locale: string) {
  const l = adminLocale(locale);
  return createTranslator({ locale: intlLocale(l), messages: getAdminMessages(l), timeZone: TIME_ZONE, namespace: "admin" });
}

/** Names of the content rules (report categories, decision reasons). */
export function reasonsT(locale: string) {
  const l = adminLocale(locale);
  return createTranslator({ locale: intlLocale(l), messages: getAdminMessages(l), timeZone: TIME_ZONE, namespace: "reasons" });
}

export function adminFormat(locale: string) {
  const il = intlLocale(adminLocale(locale));
  return {
    date: (d: Date | null) => (d ? new Intl.DateTimeFormat(il, { dateStyle: "medium", timeZone: TIME_ZONE }).format(d) : "—"),
    dateTime: (d: Date | null) => (d ? new Intl.DateTimeFormat(il, { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE }).format(d) : "—"),
    number: (n: number) => new Intl.NumberFormat(il).format(n),
    percent: (n: number) => new Intl.NumberFormat(il, { maximumFractionDigits: 1 }).format(n),
  };
}
