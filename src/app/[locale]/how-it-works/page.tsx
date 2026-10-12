import Link from "next/link";
import { intlLocale, localePath } from "@/i18n/config";
import { getFormatter, getLocale, getTranslator } from "@/i18n/server";
import { getSiteSettings } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { quote } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata("how", "/how-it-works");

/** Example sizes for the price table, in blocks per side (10, 50, 100 and 200 px with 10 px blocks). */
const EXAMPLES = [1, 5, 10, 20];

/** "How it works": the three steps and the price list with examples (spec section 13). */
export default async function HowItWorksPage() {
  const locale = await getLocale();
  const [t, format, settings] = await Promise.all([getTranslator(locale), getFormatter(locale), getSiteSettings()]);
  const money = (cents: number) => formatMoney(cents, settings.currency, intlLocale(locale));
  const block = settings.block_size_px;
  const steps = [
    { title: t("how.step1Title"), text: t("how.step1") },
    { title: t("how.step2Title"), text: t("how.step2") },
    { title: t("how.step3Title"), text: t("how.step3", { hours: settings.review_hours }) },
  ];

  return (
    <div className="content">
      <h1>{t("pages.how")}</h1>
      <p>{t("how.intro", { site: settings.site_name, pixels: settings.wall_width_px * settings.wall_height_px })}</p>

      <ol className="how-steps">
        {steps.map((step, i) => (
          <li key={i}>
            <h2>
              {i + 1}. {step.title}
            </h2>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>

      <h2>{t("how.pricesTitle")}</h2>
      <p>{t("how.pricesIntro", { price: money(settings.price_cents_per_pixel) })}</p>
      <table className="data price-examples">
        <thead>
          <tr>
            <th scope="col">{t("how.colSize")}</th>
            <th scope="col">{t("how.colPixels")}</th>
            <th scope="col">{t("how.colPrice")}</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLES.filter((n) => n * block <= Math.min(settings.wall_width_px, settings.wall_height_px)).map((n) => {
            const q = quote(settings, n, n)!;
            return (
              <tr key={n}>
                <td>
                  {n * block} × {n * block} px <span className="muted small">({t("how.blocks", { count: n * n })})</span>
                </td>
                <td>{format.number(q.pixels)}</td>
                <td>
                  <b>{money(q.totalCents)}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">{settings.vat_payer ? t("rent.vatIncluded", { rate: settings.vat_rate_pct }) : t("rent.notVatPayer")}</p>

      <h2>{t("how.rulesTitle")}</h2>
      <p>{t.rich("how.rules", { rules: (chunks) => <Link href={localePath(locale, "/content-rules")}>{chunks}</Link> })}</p>

      <p>
        <Link className="btn btn-rent btn-big" href={localePath(locale, "/buy")}>
          {t("how.start")}
        </Link>
      </p>
      <p>{t.rich("how.more", { faq: (chunks) => <Link href={localePath(locale, "/faq")}>{chunks}</Link> })}</p>
    </div>
  );
}
