import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ModerationQueue } from "@/components/admin/ModerationQueue";
import { moderationQueue } from "@/lib/admin/queue";
import { adminT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";
import { db } from "@/lib/db";

export const instant = false;

export default function ModerationPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <Moderation />
    </Suspense>
  );
}

async function Moderation() {
  const session = await requireStaffPage("moderator", "/admin/moderation");
  const t = adminT(session.user.locale);
  const [items, settings, snapshot] = await Promise.all([moderationQueue(db()), getSiteSettings(), getWallSnapshot()]);
  return (
    <AdminShell session={session} active="moderation">
      <h1>{t("moderation.title", { count: items.length })}</h1>
      <p className="muted small">{t("moderation.keys")}</p>
      <ModerationQueue
        items={items}
        blockSize={settings.block_size_px}
        reviewHours={settings.review_hours}
        currency={settings.currency}
        wallImage={snapshot.image?.png ?? null}
        cols={snapshot.cols}
        rows={snapshot.rows}
      />
    </AdminShell>
  );
}
