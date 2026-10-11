import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { intlLocale } from "@/i18n/config";
import { dashboardStats } from "@/lib/admin/stats";
import { adminFormat, adminT } from "@/lib/admin/t";
import { getSession, requireStaffPage } from "@/lib/auth/current";
import { getSiteSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export const instant = false;

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  // Moderators start in the moderation queue.
  const early = await getSession();
  if (early?.user.role === "moderator") redirect("/admin/moderation");
  const session = await requireStaffPage("admin", "/admin");
  const locale = session.user.locale;
  const t = adminT(locale);
  const f = adminFormat(locale);
  const settings = await getSiteSettings();
  const s = await dashboardStats(db(), settings);
  const money = (cents: number) => formatMoney(cents, settings.currency, intlLocale(locale));
  const pct = f.percent(s.totalPixels ? (s.rentedPixels / s.totalPixels) * 100 : 0);
  const conversion = s.conversion.started ? Math.round((s.conversion.paid / s.conversion.started) * 100) : 0;

  return (
    <AdminShell session={session} active="overview">
      <h1>{t("overview.title")}</h1>
      <div className="admin-grid">
        <table className="data">
          <caption>{t("overview.revenue")}</caption>
          <tbody>
            <tr>
              <th scope="row">{t("overview.today")}</th>
              <td>{money(s.revenue.day)}</td>
            </tr>
            <tr>
              <th scope="row">{t("overview.week")}</th>
              <td>{money(s.revenue.week)}</td>
            </tr>
            <tr>
              <th scope="row">{t("overview.month")}</th>
              <td>{money(s.revenue.month)}</td>
            </tr>
            <tr>
              <th scope="row">{t("overview.total")}</th>
              <td>
                <b>{money(s.revenue.total)}</b>
              </td>
            </tr>
          </tbody>
        </table>
        <table className="data">
          <caption>{t("overview.wall")}</caption>
          <tbody>
            <tr>
              <th scope="row">{t("overview.rentedPixels")}</th>
              <td>
                {f.number(s.rentedPixels)} / {f.number(s.totalPixels)} ({pct} %)
              </td>
            </tr>
            <tr>
              <th scope="row">{t("overview.activeRentals")}</th>
              <td>{f.number(s.activeRentals)}</td>
            </tr>
            <tr>
              <th scope="row">{t("overview.endingSoon")}</th>
              <td>{f.number(s.endingSoon)}</td>
            </tr>
            <tr>
              <th scope="row">{t("overview.conversion")}</th>
              <td>{t("overview.conversionValue", { paid: s.conversion.paid, started: s.conversion.started, pct: conversion })}</td>
            </tr>
          </tbody>
        </table>
        <table className="data">
          <caption>{t("overview.work")}</caption>
          <tbody>
            <tr>
              <th scope="row">
                <Link href="/admin/moderation">{t("overview.pending")}</Link>
              </th>
              <td>
                {s.pendingReview}
                {s.overdueReview > 0 && <span className="error"> {t("overview.overdue", { count: s.overdueReview, hours: settings.review_hours })}</span>}
              </td>
            </tr>
            <tr>
              <th scope="row">
                <Link href="/admin/reports">{t("overview.openReports")}</Link>
              </th>
              <td>{s.openReports}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {settings.sales_paused && <p className="warning">{t("overview.salesPaused")}</p>}
    </AdminShell>
  );
}
