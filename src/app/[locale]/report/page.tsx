import { Suspense } from "react";
import { ReportForm } from "@/components/site/ReportForm";
import { ClientMessages } from "@/i18n/client-messages";
import { localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { getSiteSettings } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { operatorDetails } from "@/lib/site-info";
import { turnstileSiteKey } from "@/lib/turnstile";

export const generateMetadata = () => pageMetadata("report", "/report");

/** "Report content" (EU Digital Services Act: notice and action). */
export default async function ReportPage() {
  const [t, locale] = await Promise.all([getTranslator(), getLocale()]);
  return (
    <div className="content">
      <h1>{t("pages.report")}</h1>
      <p>{t("report.intro")}</p>
      <p>
        {t.rich("report.rules", {
          link: (chunks) => <a href={localePath(locale, "/content-rules")}>{chunks}</a>,
        })}
      </p>
      <Suspense fallback={<p>…</p>}>
        <ReportSection />
      </Suspense>
    </div>
  );
}

async function ReportSection() {
  const [settings, t] = await Promise.all([getSiteSettings(), getTranslator()]);
  return (
    <>
      <ClientMessages namespaces={["report", "reasons"]}>
        <ReportForm siteKey={turnstileSiteKey()} />
      </ClientMessages>
      <h2>{t("report.authoritiesTitle")}</h2>
      <p>{t("report.authorities", { email: operatorDetails(settings, t("legal.todo")).email })}</p>
    </>
  );
}
