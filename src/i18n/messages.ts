import adminEn from "@/messages/admin/en.json";
import adminSk from "@/messages/admin/sk.json";
import cs from "@/messages/cs.json";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import hu from "@/messages/hu.json";
import it from "@/messages/it.json";
import pl from "@/messages/pl.json";
import pt from "@/messages/pt.json";
import sk from "@/messages/sk.json";
import type { AdminLocale, Locale, Messages, Namespace } from "./config";

/**
 * All translations, for server code only (pages, e-mails, scripts). Client
 * components receive just the namespaces they need from the server (see
 * ClientMessages), so the browser never downloads all ten languages.
 */

export type AdminMessages = typeof adminEn;
export type AllMessages = Messages & AdminMessages;

const MESSAGES: Record<Locale, Messages> = { en, sk, cs, de, pl, hu, fr, es, it, pt };
const ADMIN_MESSAGES: Record<AdminLocale, AdminMessages> = { en: adminEn, sk: adminSk };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

/** Public texts plus the admin namespace, in English or Slovak. */
export function getAdminMessages(locale: AdminLocale): AllMessages {
  return { ...MESSAGES[locale], ...ADMIN_MESSAGES[locale] };
}

/** Namespaces every page needs in the browser (header, navigation, wall, 404). */
export const BASE_NAMESPACES = ["common", "header", "nav", "pages", "wall", "popup"] as const satisfies readonly Namespace[];

export function pickMessages(locale: Locale, namespaces: readonly Namespace[]): Partial<Messages> {
  const all = MESSAGES[locale];
  const out: Partial<Record<Namespace, unknown>> = {};
  for (const ns of namespaces) out[ns] = all[ns];
  return out as Partial<Messages>;
}
