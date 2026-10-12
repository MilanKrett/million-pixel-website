import Link from "next/link";
import { intlLocale, localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { getSiteSettings } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { quote } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata("faq", "/faq");

const QUESTIONS = ["cost", "howLong", "what", "when", "rejected", "change", "close", "blocks", "gift", "receipt", "private"] as const;

/** Frequently asked questions (spec section 13); every number comes from the settings. */
export default async function FaqPage() {
  const locale = await getLocale();
  const [t, settings] = await Promise.all([getTranslator(locale), getSiteSettings()]);
  const money = (cents: number) => formatMoney(cents, settings.currency, intlLocale(locale));
  const price = (side: number) => money(quote(settings, side, side)!.totalCents);
  const link = (path: string) =>
    function FaqLink(chunks: React.ReactNode) {
      return <Link href={localePath(locale, path)}>{chunks}</Link>;
    };
  const values = {
    site: settings.site_name,
    price: money(settings.price_cents_per_pixel),
    block: price(1),
    spot50: price(5),
    spot100: price(10),
    vat: settings.vat_payer ? t("rent.vatIncluded", { rate: settings.vat_rate_pct }) : t("rent.notVatPayer"),
    mb: settings.upload_max_mb,
    hours: settings.review_hours,
    days: settings.reupload_days,
    rules: link("/content-rules"),
    terms: link("/terms"),
    contact: link("/contact"),
  };

  return (
    <div className="content">
      <h1>{t("pages.faq")}</h1>
      <p>{t.rich("faq.intro", { contact: values.contact })}</p>
      <div className="faq">
        {QUESTIONS.map((q) => (
          <section key={q} id={q} aria-labelledby={`${q}-q`}>
            <h2 id={`${q}-q`}>{t(`faq.${q}Q`)}</h2>
            <p>{t.rich(`faq.${q}A`, values)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
