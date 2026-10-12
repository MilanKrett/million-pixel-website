"use client";

import { createContext, useContext } from "react";
import { IntlProvider } from "use-intl/react";
import { DEFAULT_LOCALE, intlLocale, TIME_ZONE, type Locale } from "./config";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Makes translations available to client components (useTranslations,
 * useFormatter). `messages` holds only the namespaces this part of the page
 * needs; the server picks them (lib: i18n/messages.ts → pickMessages).
 */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Record<string, unknown>; children: React.ReactNode }) {
  return (
    <LocaleContext value={locale}>
      <IntlProvider locale={intlLocale(locale)} messages={messages as never} timeZone={TIME_ZONE}>
        {children}
      </IntlProvider>
    </LocaleContext>
  );
}

/** The site language inside client components (the admin's language on admin pages). */
export function useAppLocale(): Locale {
  return useContext(LocaleContext);
}
