import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReportList } from "@/components/admin/ReportList";
import { listReports } from "@/lib/admin/reports";
import { adminT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";
import { db } from "@/lib/db";
import { reportReference } from "@/lib/moderation/reports";

export const instant = false;

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  const session = await requireStaffPage("moderator", "/admin/reports");
  const params = await searchParams;
  const which = params.show === "closed" ? "closed" : "open";
  const t = adminT(session.user.locale);
  const [reports, settings, snapshot] = await Promise.all([listReports(db(), which), getSiteSettings(), getWallSnapshot()]);
  return (
    <AdminShell session={session} active="reports">
      <h1>{t("reports.title")}</h1>
      <p>
        {which === "open" ? <b>{t("reports.open")}</b> : <Link href="/admin/reports">{t("reports.open")}</Link>} |{" "}
        {which === "closed" ? <b>{t("reports.closed")}</b> : <Link href="/admin/reports?show=closed">{t("reports.closed")}</Link>}
      </p>
      <ReportList
        reports={reports.map((r) => ({
          ...r,
          reference: reportReference(r.id),
          createdAt: r.createdAt.toISOString(),
          resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        }))}
        blockSize={settings.block_size_px}
        wallImage={snapshot.image?.png ?? null}
        cols={snapshot.cols}
        rows={snapshot.rows}
      />
    </AdminShell>
  );
}
