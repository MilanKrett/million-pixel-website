import { adminLocale } from "@/i18n/config";
import { getAdminMessages } from "@/i18n/messages";
import { I18nProvider } from "@/i18n/provider";

/** Translations for the admin's client components, in the staff member's admin language. */
export function AdminI18n({ locale, children }: { locale: string; children: React.ReactNode }) {
  const l = adminLocale(locale);
  return (
    <I18nProvider locale={l} messages={getAdminMessages(l)}>
      {children}
    </I18nProvider>
  );
}
