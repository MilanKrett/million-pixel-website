import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { searchRentals } from "@/lib/admin/rentals";
import { adminFormat, adminT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { getSiteSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { pixelRange } from "@/lib/geometry";
import { displayDomain } from "@/lib/url";

export const instant = false;

export default function RentalsPage({ searchParams }: PageProps<"/admin/rentals">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Rentals searchParams={searchParams} />
    </Suspense>
  );
}

async function Rentals({ searchParams }: { searchParams: PageProps<"/admin/rentals">["searchParams"] }) {
  const session = await requireStaffPage("admin", "/admin/rentals");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const t = adminT(session.user.locale);
  const f = adminFormat(session.user.locale);
  const settings = await getSiteSettings();
  const rows = await searchRentals(db(), q, settings.block_size_px);
  return (
    <AdminShell session={session} active="rentals">
      <h1>{t("rentals.title")}</h1>
      <form method="get" className="field-row">
        <label>
          {t("rentals.search")}
          <input type="search" name="q" defaultValue={q} placeholder={t("rentals.searchHint")} size={40} />
        </label>
        <button type="submit" className="btn">
          {t("rentals.find")}
        </button>
        <a className="btn" href="/api/admin/export?kind=rentals" download>
          {t("rentals.exportCsv")}
        </a>
      </form>
      <p className="muted small">{t("rentals.found", { count: rows.length })}</p>
      <table className="data admin-table">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">{t("rentals.colTitle")}</th>
            <th scope="col">{t("rentals.colPlace")}</th>
            <th scope="col">{t("rentals.colStatus")}</th>
            <th scope="col">{t("rentals.colEmail")}</th>
            <th scope="col">{t("rentals.colPaid")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const range = pixelRange(r.rect, settings.block_size_px);
            return (
              <tr key={r.id}>
                <td>
                  <a href={`/admin/rentals/${r.no}`}>{r.no}</a>
                </td>
                <td>
                  {r.title ?? "—"}
                  {r.url && <span className="muted small"> {displayDomain(r.url)}</span>}
                </td>
                <td className="small">
                  x {range.x0}–{range.x1}, y {range.y0}–{range.y1}
                </td>
                <td className="small">
                  {t(`status.${r.status}` as "status.active")}
                  {r.hidden && ` · ${t("rentals.hidden")}`}
                  {r.isReserved && ` · ${t("rentals.reserved")}`}
                  {r.isTest && ` · ${t("rentals.test")}`}
                </td>
                <td className="small">{r.email ?? "—"}</td>
                <td className="small">{f.date(r.paidAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </AdminShell>
  );
}
