import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { LOCALES } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { adminT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { loadSettings } from "@/lib/settings/load";

export const instant = false;

export default function SettingsPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const session = await requireStaffPage("admin", "/admin/settings");
  const t = adminT(session.user.locale);
  const sql = db();
  const [settings, [{ count }]] = await Promise.all([
    loadSettings(sql),
    sql<{ count: number }[]>`select count(*)::int as count from rentals where status <> 'expired'`,
  ]);
  return (
    <AdminShell session={session} active="settings">
      <h1>{t("settings.title")}</h1>
      <p>{t("settings.intro")}</p>
      <SettingsForm
        initial={settings}
        geometryLocked={count > 0}
        sloganDefaults={Object.fromEntries(LOCALES.map((l) => [l, getMessages(l).header.slogan])) as Record<(typeof LOCALES)[number], string>}
      />
    </AdminShell>
  );
}
