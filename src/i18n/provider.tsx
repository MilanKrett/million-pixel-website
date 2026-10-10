"use client";

import { IntlProvider, useLocale } from "use-intl/react";
import { getMessages, intlLocale, TIME_ZONE, type Locale } from "./config";

/** Makes translations available to client components (useTranslations, useFormatter). */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <IntlProvider locale={intlLocale(locale)} messages={getMessages(locale)} timeZone={TIME_ZONE}>
      {children}
    </IntlProvider>
  );
}

/** The site language ("en" | "sk") inside client components. */
export function useAppLocale(): Locale {
  return useLocale().toLowerCase().startsWith("sk") ? "sk" : "en";
}
