import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { RolesForm, StaffRow, WallRebuild } from "@/components/admin/ToolsActions";
import { listAudit, listStaff } from "@/lib/admin/manage";
import { adminFormat, adminT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { db } from "@/lib/db";

export const instant = false;

export default function ToolsPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <Tools />
    </Suspense>
  );
}

async function Tools() {
  const session = await requireStaffPage("admin", "/admin/tools");
  const t = adminT(session.user.locale);
  const f = adminFormat(session.user.locale);
  const sql = db();
  const [staff, audit] = await Promise.all([listStaff(sql), listAudit(sql)]);
  return (
    <AdminShell session={session} active="tools">
      <h1>{t("tools.title")}</h1>

      <h2>{t("tools.wallTitle")}</h2>
      <p>{t("tools.wallHelp")}</p>
      <WallRebuild />

      <h2>{t("tools.exportTitle")}</h2>
      <p>
        <a className="btn" href="/api/admin/export?kind=rentals" download>
          {t("tools.exportRentals")}
        </a>{" "}
        <a className="btn" href="/api/admin/export?kind=payments" download>
          {t("tools.exportPayments")}
        </a>
      </p>

      <h2>{t("tools.rolesTitle")}</h2>
      <p>{t("tools.rolesHelp")}</p>
      <table className="data admin-table">
        <thead>
          <tr>
            <th scope="col">{t("tools.email")}</th>
            <th scope="col">{t("tools.role")}</th>
            <th scope="col">{t("tools.mfa")}</th>
            <th scope="col">{t("tools.lastLogin")}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {staff.map((u) => (
            <StaffRow
              key={u.id}
              id={u.id}
              email={u.email}
              role={u.role}
              mfa={u.totp_enabled_at !== null}
              lastLogin={f.dateTime(u.last_login_at)}
              self={u.id === session.user.id}
            />
          ))}
        </tbody>
      </table>
      <RolesForm />

      <h2>{t("tools.auditTitle")}</h2>
      <table className="data admin-table small">
        <tbody>
          {audit.map((a) => (
            <tr key={a.id}>
              <td>{f.dateTime(a.created_at)}</td>
              <td>
                <b>{a.action}</b>
              </td>
              <td>
                {a.target?.startsWith("rental:") ? <span className="muted">{a.target}</span> : a.target}
              </td>
              <td>{a.actor ?? t("rental.system")}</td>
              <td className="muted break">{JSON.stringify(a.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}
