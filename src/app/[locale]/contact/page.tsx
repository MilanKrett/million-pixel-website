import Link from "next/link";
import { Suspense } from "react";
import { ContactForm } from "@/components/site/ContactForm";
import { ClientMessages } from "@/i18n/client-messages";
import { localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { getSiteSettings } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { operatorDetails } from "@/lib/site-info";
import { turnstileSiteKey } from "@/lib/turnstile";

export const generateMetadata = () => pageMetadata("contact", "/contact");

/** Contact: form, e-mail, operator details and the point of contact under the DSA (spec sections 9 and 13). */
export default async function ContactPage() {
  const locale = await getLocale();
  const t = await getTranslator(locale);
  return (
    <div className="content">
      <h1>{t("pages.contact")}</h1>
      <p>{t("contact.intro")}</p>
      <h2>{t("contact.formTitle")}</h2>
      <ClientMessages namespaces={["contact"]}>
        <ContactForm siteKey={turnstileSiteKey()} />
      </ClientMessages>
      <p>{t.rich("contact.reportHint", { report: (chunks) => <Link href={localePath(locale, "/report")}>{chunks}</Link> })}</p>
      <Suspense fallback={<p>…</p>}>
        <OperatorSection />
      </Suspense>
    </div>
  );
}

async function OperatorSection() {
  const locale = await getLocale();
  const [t, settings] = await Promise.all([getTranslator(locale), getSiteSettings()]);
  const op = operatorDetails(settings, t("legal.todo"));
  const email = op.email === t("legal.todo") ? <mark className="todo">{op.email}</mark> : <a href={`mailto:${op.email}`}>{op.email}</a>;
  return (
    <>
      <h2>{t("contact.operatorTitle")}</h2>
      <table className="data">
        <tbody>
          <tr>
            <th scope="row">{t("contact.operator")}</th>
            <td>{op.operator}</td>
          </tr>
          <tr>
            <th scope="row">{t("contact.companyId")}</th>
            <td>{op.companyId}</td>
          </tr>
          <tr>
            <th scope="row">{t("contact.address")}</th>
            <td>{op.address}</td>
          </tr>
          <tr>
            <th scope="row">{t("contact.emailLabel")}</th>
            <td>{email}</td>
          </tr>
        </tbody>
      </table>
      <h2>{t("contact.dsaTitle")}</h2>
      <p>{t("contact.dsa", { email: op.email })}</p>
    </>
  );
}
