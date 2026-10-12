import { intlLocale } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { getSiteSettings } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { operatorDetails } from "@/lib/site-info";
import { RichText, TODO_MARK } from "./RichText";

export type LegalDoc = "rules" | "terms" | "complaints" | "privacy";

/**
 * A legal text (template until a lawyer checks it). Operator details and
 * business numbers come from the settings; anything still missing is shown
 * as a highlighted "[to be completed]".
 */
export async function LegalPage({ doc }: { doc: LegalDoc }) {
  const locale = await getLocale();
  const [t, settings] = await Promise.all([getTranslator(locale), getSiteSettings()]);
  const il = intlLocale(locale);
  const text = t(`legal.${doc}`, {
    site: settings.site_name,
    ...operatorDetails(settings, TODO_MARK),
    pixels: settings.wall_width_px * settings.wall_height_px,
    price: formatMoney(settings.price_cents_per_pixel, settings.currency, il),
    vat: settings.vat_payer ? t("legal.vatPayer", { rate: settings.vat_rate_pct }) : t("legal.notVatPayer"),
    hours: settings.review_hours,
    days: settings.reupload_days,
    todo: TODO_MARK,
  });
  return (
    <div className="content legal">
      <h1>{t(`pages.${doc}`)}</h1>
      <p className="notice small">{t("legal.draft")}</p>
      <RichText text={text} locale={locale} todo={t("legal.todo")} />
    </div>
  );
}
