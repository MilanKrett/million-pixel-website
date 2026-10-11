import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditRental } from "@/components/account/EditRental";
import { AdminShell } from "@/components/admin/AdminShell";
import { RentalActions } from "@/components/admin/RentalActions";
import { intlLocale } from "@/i18n/config";
import { rentalDetail } from "@/lib/admin/rentals";
import { adminFormat, adminT, reasonsT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { getSiteSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { isReasonCode } from "@/lib/email/reasons";
import { pixelRange } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { loadRental } from "@/lib/orders/order";
import { orderResponse } from "@/lib/orders/order-response";
import { rentConfig } from "@/lib/rent-config";

export const instant = false;

export default function RentalDetailPage({ params }: PageProps<"/admin/rentals/[no]">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/admin/rentals/[no]">["params"] }) {
  const { no } = await params;
  const session = await requireStaffPage("admin", `/admin/rentals/${no}`);
  const number = Number(no);
  if (!Number.isSafeInteger(number) || number <= 0) notFound();
  const sql = db();
  const [detail, settings] = await Promise.all([rentalDetail(sql, number), getSiteSettings()]);
  if (!detail) notFound();
  const locale = session.user.locale;
  const t = adminT(locale);
  const f = adminFormat(locale);
  const r = detail.rental;
  const block = settings.block_size_px;
  const range = pixelRange(r, block);
  const money = (cents: number) => formatMoney(cents, settings.currency, intlLocale(locale));
  const tr = reasonsT(locale);
  const tReason = (code: string | null) => (code && isReasonCode(code) ? tr(code) : code);
  const editable = ["in_review", "active", "grace", "rejected"].includes(r.status);
  const rentalRow = editable ? await loadRental(sql, r.id) : null;
  const order = rentalRow ? await orderResponse(sql, settings, rentalRow) : null;
  const current = detail.contents.find((c) => c.id === r.active_content_id) ?? null;
  const paidLeft = detail.payments
    .filter((p) => p.status === "paid" || p.status === "partially_refunded")
    .reduce((sum, p) => sum + p.amount_cents - p.refunded_cents, 0);

  return (
    <AdminShell session={session} active="rentals">
      <p>
        <Link href="/admin/rentals">« {t("rentals.title")}</Link>
      </p>
      <h1>
        {t("rental.title", { no: r.no })} {current?.title && <span className="muted">— {current.title}</span>}
      </h1>
      <div className="admin-grid">
        <table className="data">
          <tbody>
            <tr>
              <th scope="row">{t("rental.status")}</th>
              <td>
                <b>{t(`status.${r.status}` as "status.active")}</b>
                {r.hidden_at && ` · ${t("rental.hiddenSince", { date: f.dateTime(r.hidden_at) })}`}
                {r.is_reserved && ` · ${t("rentals.reserved")}`}
                {r.is_test && ` · ${t("rentals.test")}`}
              </td>
            </tr>
            <tr>
              <th scope="row">{t("rental.place")}</th>
              <td>
                <a href={`/?x=${r.x}&y=${r.y}&zoom=4`} target="_blank" rel="noopener">
                  x {range.x0}–{range.x1}, y {range.y0}–{range.y1}
                </a>{" "}
                · {r.w * block} × {r.h * block} px
              </td>
            </tr>
            <tr>
              <th scope="row">{t("rental.renter")}</th>
              <td>
                {r.email ?? "—"} {r.user_id ? <span className="muted small">({t("rental.hasAccount")})</span> : null} · {r.locale.toUpperCase()}
              </td>
            </tr>
            <tr>
              <th scope="row">{t("rental.period")}</th>
              <td>
                {r.period_years ? t("moderation.years", { years: r.period_years }) : "—"} · {f.date(r.starts_at)} – {f.date(r.ends_at)}
              </td>
            </tr>
            <tr>
              <th scope="row">{t("rental.paid")}</th>
              <td>
                {r.price_cents !== null ? money(r.price_cents) : "—"} · {f.dateTime(r.paid_at)}
              </td>
            </tr>
            {r.reupload_until && (
              <tr>
                <th scope="row">{t("rental.reuploadUntil")}</th>
                <td>{f.dateTime(r.reupload_until)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RentalActions
        rentalId={r.id}
        status={r.status}
        hidden={r.hidden_at !== null}
        isReserved={r.is_reserved}
        refundableCents={paidLeft}
        currency={settings.currency}
      />

      <h2>{t("rental.contents")}</h2>
      <table className="data admin-table">
        <thead>
          <tr>
            <th scope="col">{t("rental.picture")}</th>
            <th scope="col">{t("rental.texts")}</th>
            <th scope="col">{t("rental.contentStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {detail.contents.map((c) => (
            <tr key={c.id}>
              <td>
                {c.blocked_at ? (
                  <span className="error">{t("rental.blocked")}</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- exact pixels of the content
                  <img
                    src={`/api/rentals/${r.id}/content/${c.id}`}
                    width={Math.min(160, r.w * block)}
                    height={Math.round((Math.min(160, r.w * block) / (r.w * block)) * r.h * block)}
                    alt=""
                    className="preview-zoom"
                  />
                )}
              </td>
              <td className="small">
                <b>{c.title}</b>
                <br />
                {c.url ?? "—"}
                {c.link_flagged_at && <span className="error"> {t("rental.linkFlagged")}</span>}
                <br />
                {c.display_name ?? ""}
              </td>
              <td className="small">
                {t(`contentStatus.${c.status}` as "contentStatus.approved")} {c.id === r.active_content_id && <b>· {t("rental.onWall")}</b>}
                <br />
                {f.dateTime(c.created_at)}
                {c.reason_code && (
                  <>
                    <br />
                    {tReason(c.reason_code)}
                    {c.reason && `: ${c.reason}`}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {order && (
        <details className="admin-editor">
          <summary>{t("rental.editContent")}</summary>
          <p className="muted small">{t("rental.editContentHelp")}</p>
          <EditRental
            initialOrder={order}
            current={current ? { id: current.id, kind: current.kind, title: current.title, url: current.url, displayName: current.display_name, params: {} } : null}
            config={rentConfig(settings)}
            editable
            rejected={r.status === "rejected"}
            admin
          />
        </details>
      )}

      <h2>{t("rental.payments")}</h2>
      {detail.payments.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        <table className="data admin-table">
          <tbody>
            {detail.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.invoice_number ?? "—"}</td>
                <td>{money(p.amount_cents)}</td>
                <td>{p.refunded_cents > 0 ? t("rental.refunded", { amount: money(p.refunded_cents) }) : ""}</td>
                <td>{t(`paymentStatus.${p.status}` as "paymentStatus.paid")}</td>
                <td className="small">
                  {p.provider} · {f.dateTime(p.paid_at ?? p.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>{t("rental.reports")}</h2>
      {detail.reports.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        <ul className="small">
          {detail.reports.map((p) => (
            <li key={p.id}>
              {f.dateTime(p.created_at)} · {tReason(p.category)} · {t(`reports.status.${p.status}` as "reports.status.open")} {p.description && `— ${p.description}`}
            </li>
          ))}
        </ul>
      )}

      <h2>{t("rental.emails")}</h2>
      {detail.emails.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        <ul className="small">
          {detail.emails.map((e) => (
            <li key={e.id}>
              {f.dateTime(e.created_at)} · {e.template} · {e.to_email} · {e.subject} ({e.status})
            </li>
          ))}
        </ul>
      )}

      <h2>{t("rental.audit")}</h2>
      {detail.audit.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        <ul className="small">
          {detail.audit.map((a) => (
            <li key={a.id}>
              {f.dateTime(a.created_at)} · <b>{a.action}</b> · {a.actor ?? t("rental.system")} <span className="muted">{JSON.stringify(a.details)}</span>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
