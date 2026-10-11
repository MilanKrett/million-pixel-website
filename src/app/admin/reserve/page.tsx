import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReservePlace } from "@/components/admin/ReservePlace";
import { adminT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";
import { db } from "@/lib/db";

export const instant = false;

export default function ReservePage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <Reserve />
    </Suspense>
  );
}

async function Reserve() {
  const session = await requireStaffPage("admin", "/admin/reserve");
  const t = adminT(session.user.locale);
  const [settings, snapshot] = await Promise.all([getSiteSettings(), getWallSnapshot()]);
  const reserved = await db()<{ no: number; x: number; y: number; w: number; h: number; ends_at: Date | null; title: string | null }[]>`
    select r.no, r.x, r.y, r.w, r.h, r.ends_at, c.title
    from rentals r left join content_versions c on c.id = r.active_content_id
    where r.is_reserved and r.status in ('active', 'grace')
    order by r.no
  `;
  return (
    <AdminShell session={session} active="reserve">
      <h1>{t("reserve.title")}</h1>
      <p>{t("reserve.intro")}</p>
      <ReservePlace snapshot={snapshot} blockSize={settings.block_size_px} currency={settings.currency} pricePerPixel={settings.price_cents_per_pixel} />
      <h2>{t("reserve.existing", { count: reserved.length })}</h2>
      <ul>
        {reserved.map((r) => (
          <li key={r.no}>
            <a href={`/admin/rentals/${r.no}`}>#{r.no}</a> {r.title ?? t("reserve.noContent")} · {r.w * settings.block_size_px} × {r.h * settings.block_size_px} px
            {r.ends_at ? ` · ${t("reserve.until", { date: r.ends_at.toISOString().slice(0, 10) })}` : ` · ${t("reserve.noEnd")}`}
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
