"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import type { AdminReport } from "@/lib/admin/reports";
import { isReasonCode } from "@/lib/email/reasons";
import { displayDomain } from "@/lib/url";
import { DecisionForm } from "./DecisionForm";
import { InWallPreview } from "./InWallPreview";

type Report = Omit<AdminReport, "createdAt" | "resolvedAt"> & { reference: string; createdAt: string; resolvedAt: string | null };
type Mode = null | "hide" | "remove" | "dismiss";

/** Reports with the reported content and the three decisions. */
export function ReportList({ reports: initial, blockSize, wallImage, cols, rows }: { reports: Report[]; blockSize: number; wallImage: string | null; cols: number; rows: number }) {
  const t = useTranslations("admin.reports");
  const tr = useTranslations("reasons");
  const ts = useTranslations("admin.status");
  const format = useFormatter();
  const [reports, setReports] = useState(initial);
  const [open, setOpen] = useState<{ id: string; mode: Mode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unhide, setUnhide] = useState(true);

  if (!reports.length) return <p>{t("empty")}</p>;

  const decide = async (report: Report, decision: "dismiss" | "hide" | "remove", reasonCode?: string, note?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reports/${report.id}`, { method: "POST", body: JSON.stringify({ decision, reasonCode, note, unhide }) });
      setOpen(null);
      if (decision === "hide") {
        setReports((list) => list.map((r) => (r.rental && r.rental.id === report.rental?.id ? { ...r, rental: { ...r.rental, hidden: true } } : r)));
      } else if (decision === "remove") {
        setReports((list) => list.filter((r) => r.rental?.id !== report.rental?.id));
      } else {
        setReports((list) => list.filter((r) => r.id !== report.id));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      {reports.map((r) => {
        const rental = r.rental;
        const src = rental?.contentId ? `/api/rentals/${rental.id}/content/${rental.contentId}` : null;
        const isOpen = open?.id === r.id ? open.mode : null;
        return (
          <article key={r.id} className={`admin-item${r.category === "child" ? " is-urgent" : ""}`}>
            <div className="admin-previews">
              {src && rental && (
                <figure>
                  <InWallPreview src={src} rect={rental.rect} blockSize={blockSize} wallImage={wallImage} cols={cols} rows={rows} maxWidth={280} />
                  <figcaption>{rental.hidden ? t("hiddenNow") : t("onWall")}</figcaption>
                </figure>
              )}
            </div>
            <div className="admin-info">
              <table className="data">
                <tbody>
                  <tr>
                    <th scope="row">{t("reference")}</th>
                    <td>
                      {r.reference} · {format.dateTime(new Date(r.createdAt), { dateStyle: "short", timeStyle: "short" })}
                      {r.source === "system" && <b> · {t("automatic")}</b>}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("category")}</th>
                    <td className={r.category === "child" ? "error" : undefined}>
                      <b>{isReasonCode(r.category) ? tr(r.category) : r.category}</b>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("description")}</th>
                    <td className="pre-wrap">{r.description ?? "—"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t("reporter")}</th>
                    <td>{r.reporterEmail ?? t("anonymous")}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t("rental")}</th>
                    <td>
                      {rental ? (
                        <>
                          <a href={`/admin/rentals/${rental.no}`}>#{rental.no}</a> · {rental.title ?? "—"}
                          {rental.url && <span className="muted"> · {displayDomain(rental.url)}</span>}
                          <br />
                          <span className="small muted">
                            {ts.has(rental.status as "active") ? ts(rental.status as "active") : rental.status}
                            {rental.hidden && ` · ${t("hidden")}`} · {t("openReports", { count: rental.openReports })}
                          </span>
                        </>
                      ) : (
                        t("rentalGone", { no: r.rentalNo ?? 0 })
                      )}
                    </td>
                  </tr>
                  {r.status !== "open" && (
                    <tr>
                      <th scope="row">{t("decision")}</th>
                      <td>
                        {t(`status.${r.status}` as "status.dismissed")}
                        {r.action && r.action !== "none" && ` (${t(`action.${r.action}` as "action.hidden")})`}
                        {r.resolution && <span className="muted"> — {r.resolution}</span>}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {r.status === "open" &&
                (isOpen === "hide" || isOpen === "remove" ? (
                  <DecisionForm
                    title={isOpen === "hide" ? t("hideTitle") : t("removeTitle")}
                    submitLabel={isOpen === "hide" ? t("hide") : t("remove")}
                    initialReason={isReasonCode(r.category) ? r.category : undefined}
                    busy={busy}
                    onSubmit={(input) => decide(r, isOpen, input.reasonCode, input.note)}
                    onCancel={() => setOpen(null)}
                  />
                ) : isOpen === "dismiss" ? (
                  <form
                    className="decision-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const note = new FormData(e.currentTarget).get("note");
                      decide(r, "dismiss", "other", typeof note === "string" ? note : "");
                    }}
                  >
                    <b>{t("dismissTitle")}</b>
                    <label className="field">
                      {t("dismissNote")}
                      <textarea name="note" rows={2} maxLength={2000} />
                    </label>
                    {rental?.hidden && (
                      <label className="check-line">
                        <input type="checkbox" checked={unhide} onChange={(e) => setUnhide(e.target.checked)} /> {t("unhide")}
                      </label>
                    )}
                    <p>
                      <button type="submit" className="btn" disabled={busy}>
                        {t("dismiss")}
                      </button>{" "}
                      <button type="button" className="btn" onClick={() => setOpen(null)}>
                        {t("cancel")}
                      </button>
                    </p>
                  </form>
                ) : (
                  <p className="admin-actions">
                    {rental && !rental.hidden && rental.status !== "removed" && (
                      <button type="button" className="btn" onClick={() => setOpen({ id: r.id, mode: "hide" })}>
                        {t("hide")}
                      </button>
                    )}{" "}
                    {rental && (rental.status === "active" || rental.status === "grace") && (
                      <button type="button" className="btn" onClick={() => setOpen({ id: r.id, mode: "remove" })}>
                        {t("remove")}
                      </button>
                    )}{" "}
                    <button type="button" className="btn" onClick={() => setOpen({ id: r.id, mode: "dismiss" })}>
                      {t("dismiss")}
                    </button>
                  </p>
                ))}
            </div>
          </article>
        );
      })}
    </>
  );
}
