import "server-only";
import type { Namespace } from "./config";
import { BASE_NAMESPACES, pickMessages } from "./messages";
import { I18nProvider } from "./provider";
import { getLocale } from "./server";

/**
 * Translations for the client components inside: the namespaces of every
 * page plus `namespaces` (e.g. "rent" on the order page). Keeps the texts
 * of other pages and languages out of the browser.
 */
export async function ClientMessages({ namespaces, children }: { namespaces: readonly Namespace[]; children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} messages={pickMessages(locale, [...BASE_NAMESPACES, ...namespaces])}>
      {children}
    </I18nProvider>
  );
}
