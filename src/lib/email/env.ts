import type { Locale } from "@/i18n/config";
import type { Sql } from "@/lib/db";
import { loadSettings } from "@/lib/settings/load";
import type { EmailEnv, EmailTexts } from "./templates";

/** Settings plus the e-mail texts changed in the admin. */
export async function loadEmailEnv(sql: Sql): Promise<EmailEnv> {
  const [settings, rows] = await Promise.all([
    loadSettings(sql),
    sql<{ locale: Locale; key: string; value: string }[]>`select locale, key, value from email_texts`,
  ]);
  const texts: EmailTexts = {};
  for (const row of rows) (texts[row.locale] ??= {})[row.key] = row.value;
  return { settings, texts };
}
