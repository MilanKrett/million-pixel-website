import Link from "next/link";
import { adminLocale } from "@/i18n/config";
import { menuCounts } from "@/lib/admin/stats";
import { adminT } from "@/lib/admin/t";
import type { SessionInfo } from "@/lib/auth/session";
import { getSiteSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { AdminI18n } from "./AdminI18n";
import { LocaleSwitch } from "./LocaleSwitch";

export type AdminSection = "overview" | "moderation" | "reports" | "messages" | "rentals" | "reserve" | "settings" | "emails" | "tools";

/** Header, menu (with waiting counts) and language switch around every admin page. */
export async function AdminShell({ session, active, children }: { session: SessionInfo; active: AdminSection; children: React.ReactNode }) {
  const locale = adminLocale(session.user.locale);
  const t = adminT(locale);
  const [counts, settings] = await Promise.all([menuCounts(db()), getSiteSettings()]);
  const isAdmin = session.user.role === "admin";
  const items: { key: AdminSection; href: string; label: string }[] = [
    ...(isAdmin ? [{ key: "overview" as const, href: "/admin", label: t("nav.overview") }] : []),
    { key: "moderation", href: "/admin/moderation", label: `${t("nav.moderation")} (${counts.pending})` },
    { key: "reports", href: "/admin/reports", label: `${t("nav.reports")} (${counts.reports})` },
    ...(isAdmin
      ? [
          { key: "messages" as const, href: "/admin/messages", label: `${t("nav.messages")} (${counts.messages})` },
          { key: "rentals" as const, href: "/admin/rentals", label: t("nav.rentals") },
          { key: "reserve" as const, href: "/admin/reserve", label: t("nav.reserve") },
          { key: "settings" as const, href: "/admin/settings", label: t("nav.settings") },
          { key: "emails" as const, href: "/admin/emails", label: t("nav.emails") },
          { key: "tools" as const, href: "/admin/tools", label: t("nav.tools") },
        ]
      : []),
  ];

  return (
    <AdminI18n locale={locale}>
      <header className="admin-header">
        <Link href="/admin" className="admin-logo">
          {settings.site_name} · {t("title")}
        </Link>
        <span className="admin-user small">
          {session.user.email} ({t(`roles.${session.user.role}`)}) · <LocaleSwitch current={locale} /> ·{" "}
          <Link href="/">{t("toSite")}</Link> ·{" "}
          <form method="post" action="/api/auth/logout" className="inline-form">
            <input type="hidden" name="next" value="/" />
            <button type="submit" className="link-button">
              {t("logout")}
            </button>
          </form>
        </span>
      </header>
      <nav className="nav admin-nav" aria-label={t("title")}>
        {items.map((item, i) => (
          <span key={item.key}>
            {i > 0 && <span className="sep"> | </span>}
            {item.key === active ? <b>{item.label}</b> : <a href={item.href}>{item.label}</a>}
          </span>
        ))}
      </nav>
      <div className="admin-main">{children}</div>
    </AdminI18n>
  );
}
