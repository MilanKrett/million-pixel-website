import { connection } from "next/server";
import { Suspense } from "react";
import { createTranslator } from "use-intl/core";
import { getMessages, intlLocale, TIME_ZONE } from "@/i18n/config";
import { db } from "@/lib/db";
import { pixelRange } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { loadSettings } from "@/lib/settings/load";
import { displayDomain } from "@/lib/url";

export const instant = false;

const t = createTranslator({ locale: intlLocale("sk"), messages: getMessages("sk"), timeZone: TIME_ZONE, namespace: "admin" });

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Queue searchParams={searchParams} />
    </Suspense>
  );
}

async function Queue({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const sql = db();
  const settings = await loadSettings(sql);
  const rows = await sql<
    {
      id: string;
      no: number;
      x: number;
      y: number;
      w: number;
      h: number;
      email: string | null;
      paid_at: Date | null;
      period_years: number | null;
      price_cents: number | null;
      content_id: string;
      title: string | null;
      url: string | null;
      display_name: string | null;
      kind: string;
      hours: number;
    }[]
  >`
    select r.id, r.no, r.x, r.y, r.w, r.h, r.email, r.paid_at, r.period_years, r.price_cents,
           c.id as content_id, c.title, c.url, c.display_name, c.kind,
           (extract(epoch from now() - coalesce(r.paid_at, r.created_at)) / 3600)::float8 as hours
    from rentals r
    join lateral (
      select * from content_versions where rental_id = r.id and status = 'pending' order by created_at desc limit 1
    ) c on true
    where r.status = 'in_review'
    order by r.paid_at nulls last
  `;
  const date = new Intl.DateTimeFormat("sk-SK", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
  const notice = typeof params.approved === "string" ? t("approved") : typeof params.error === "string" ? t("error", { reason: params.error }) : null;

  return (
    <div className="content wide">
      <h1>{t("title")}</h1>
      <p className="notice small">{t("temporary")}</p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <h2>{t("queue", { count: rows.length })}</h2>
      {rows.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <div className="admin-queue">
          {rows.map((r) => {
            const range = pixelRange(r, settings.block_size_px);
            const w = r.w * settings.block_size_px;
            const h = r.h * settings.block_size_px;
            const scale = Math.max(1, Math.min(8, Math.floor(240 / Math.max(w, h))));
            const late = r.hours > settings.review_hours;
            return (
              <div className="admin-item" key={r.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- exact pixels of the submitted content */}
                <img
                  src={`/api/rentals/${r.id}/content/${r.content_id}`}
                  width={w * scale}
                  height={h * scale}
                  alt={r.title ?? ""}
                  className="preview-zoom"
                />
                <div>
                  <table className="data">
                    <tbody>
                      <tr>
                        <th scope="row">{t("number")}</th>
                        <td>#{r.no}</td>
                      </tr>
                      <tr>
                        <th scope="row">{t("titleLabel")}</th>
                        <td>{r.title}</td>
                      </tr>
                      <tr>
                        <th scope="row">{t("link")}</th>
                        <td>{r.url ? `${displayDomain(r.url)} — ${r.url}` : "—"}</td>
                      </tr>
                      <tr>
                        <th scope="row">{t("name")}</th>
                        <td>{r.display_name ?? "—"}</td>
                      </tr>
                      <tr>
                        <th scope="row">{t("email")}</th>
                        <td>{r.email}</td>
                      </tr>
                      <tr>
                        <th scope="row">{t("place")}</th>
                        <td>
                          x {range.x0}–{range.x1}, y {range.y0}–{range.y1} · {w} × {h} px · {t(`kind.${r.kind}` as "kind.upload")}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">{t("paid")}</th>
                        <td>
                          {r.price_cents !== null ? formatMoney(r.price_cents, settings.currency, "sk-SK") : "—"} ·{" "}
                          {r.paid_at ? date.format(r.paid_at) : "—"} · {t("years", { years: r.period_years ?? 1 })}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">{t("waiting")}</th>
                        <td className={late ? "error" : undefined}>{t("hours", { hours: Math.floor(r.hours) })}</td>
                      </tr>
                    </tbody>
                  </table>
                  <form method="post" action={`/api/admin/rentals/${r.id}/approve`}>
                    <button type="submit" className="btn btn-rent">
                      {t("approve")}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
