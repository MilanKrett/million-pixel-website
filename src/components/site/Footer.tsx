import { localePath, type Locale } from "@/i18n/config";
import { getTranslator } from "@/i18n/server";
import { getSiteSettings } from "@/lib/data";
import { operatorDetails } from "@/lib/site-info";
import { CurrentYear } from "./CurrentYear";

export async function Footer({ locale }: { locale: Locale }) {
  const [settings, t] = await Promise.all([getSiteSettings(), getTranslator(locale)]);
  const op = operatorDetails(settings, t("legal.todo"));
  const links = [
    { href: "/content-rules", label: t("footer.rules") },
    { href: "/terms", label: t("footer.terms") },
    { href: "/complaints", label: t("footer.complaints") },
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/report", label: t("footer.report") },
    { href: "/contact", label: t("footer.contact") },
  ];

  return (
    <footer className="site-footer">
      <p>
        © <CurrentYear /> {settings.site_name}
        {links.map((link) => (
          <span key={link.href}>
            {" "}
            <span className="sep">|</span> <a href={localePath(locale, link.href)}>{link.label}</a>
          </span>
        ))}
      </p>
      <p>{t("footer.operator", { name: op.operator, id: op.companyId, address: op.address })}</p>
      <p>{t("footer.inspired")}</p>
    </footer>
  );
}
