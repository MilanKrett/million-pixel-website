"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import type { QueueItem } from "@/lib/admin/queue";
import { pixelRange } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { displayDomain } from "@/lib/url";
import { ChecksSummary } from "./ChecksSummary";
import { DecisionForm, type DecisionInput } from "./DecisionForm";
import { InWallPreview } from "./InWallPreview";

type Mode = null | "reject" | "changes";

/**
 * The moderation queue, oldest first. Keyboard: J / K next / previous,
 * A approve, E ask for changes, R reject, Esc closes a form.
 */
export function ModerationQueue({
  items: initial,
  blockSize,
  reviewHours,
  currency,
  wallImage,
  cols,
  rows,
}: {
  items: QueueItem[];
  blockSize: number;
  reviewHours: number;
  currency: string;
  wallImage: string | null;
  cols: number;
  rows: number;
}) {
  const t = useTranslations("admin.moderation");
  const [items, setItems] = useState(initial);
  const [focus, setFocus] = useState(0);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const current = items[Math.min(focus, items.length - 1)];

  const decide = async (item: QueueItem, action: "approve" | "reject" | "changes", input?: DecisionInput) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/moderation", {
        method: "POST",
        body: JSON.stringify({
          contentId: item.contentId,
          action,
          reasonCode: input?.reasonCode,
          note: input?.note,
          refundNow: input?.extra === true,
        }),
      });
      setItems((list) => list.filter((i) => i.contentId !== item.contentId));
      setMode(null);
      setMessage(t(`done.${action}`, { no: item.no }));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  const decideRef = useRef(decide);
  useEffect(() => {
    decideRef.current = decide;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select") || mode) return;
      const key = e.key.toLowerCase();
      if (key === "j") setFocus((f) => Math.min(items.length - 1, f + 1));
      else if (key === "k") setFocus((f) => Math.max(0, f - 1));
      else if (key === "a" && current && !busy) decideRef.current(current, "approve");
      else if (key === "r" && current) setMode("reject");
      else if (key === "e" && current) setMode("changes");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, current, mode, busy]);

  useEffect(() => {
    refs.current[focus]?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  return (
    <>
      {message && (
        <p className="notice small" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      {items.length === 0 && <p>{t("empty")}</p>}
      {items.map((item, index) => {
        const w = item.rect.w * blockSize;
        const h = item.rect.h * blockSize;
        const scale = Math.max(1, Math.min(8, Math.floor(260 / Math.max(w, h))));
        const range = pixelRange(item.rect, blockSize);
        const focused = item === current;
        const late = item.waitingHours > reviewHours;
        const src = `/api/rentals/${item.rentalId}/content/${item.contentId}`;
        return (
          <article
            key={item.contentId}
            ref={(el) => {
              refs.current[index] = el;
            }}
            className={`admin-item${focused ? " is-focused" : ""}`}
            onClick={() => setFocus(index)}
          >
            <div className="admin-previews">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element -- exact pixels of the submitted content */}
                <img src={src} width={w * scale} height={h * scale} alt="" className="preview-zoom" />
                <figcaption>{t("enlarged", { scale })}</figcaption>
              </figure>
              <figure>
                <InWallPreview src={src} rect={item.rect} blockSize={blockSize} wallImage={wallImage} cols={cols} rows={rows} maxWidth={300} />
                <figcaption>{t("inWall")}</figcaption>
              </figure>
              {item.kind === "change" && item.currentContentId && (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element -- exact pixels of the current content */}
                  <img src={`/api/rentals/${item.rentalId}/content/${item.currentContentId}`} width={w * scale} height={h * scale} alt="" className="preview-zoom" />
                  <figcaption>{t("currentOnWall")}</figcaption>
                </figure>
              )}
            </div>
            <div className="admin-info">
              <table className="data">
                <tbody>
                  <tr>
                    <th scope="row">{t("rental")}</th>
                    <td>
                      <a href={`/admin/rentals/${item.no}`}>#{item.no}</a> · {item.kind === "new" ? t("kindNew") : t("kindChange")} · {t(`contentKind.${item.contentKind}` as "contentKind.upload")}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("titleLabel")}</th>
                    <td>
                      <b>{item.title}</b>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("link")}</th>
                    <td>
                      {item.url ? (
                        <>
                          <b>{displayDomain(item.url)}</b> <span className="muted small break">{item.url}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("name")}</th>
                    <td>{item.displayName ?? "—"}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t("place")}</th>
                    <td>
                      x {range.x0}–{range.x1}, y {range.y0}–{range.y1} · {w} × {h} px
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("renter")}</th>
                    <td>
                      {item.email ?? "—"}
                      <br />
                      <span className="small muted">
                        {t("history", { rentals: item.history.rentals, rejected: item.history.rejected, reports: item.history.reports, removed: item.history.removed })}
                      </span>
                    </td>
                  </tr>
                  {item.kind === "new" && (
                    <tr>
                      <th scope="row">{t("paid")}</th>
                      <td>
                        {item.priceCents !== null ? formatMoney(item.priceCents, currency, "sk-SK") : "—"} · {t("years", { years: item.periodYears ?? 1 })}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row">{t("waiting")}</th>
                    <td className={late ? "error" : undefined}>{t("hours", { hours: Math.floor(item.waitingHours) })}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t("checks")}</th>
                    <td>
                      <ChecksSummary checks={item.checks} />
                    </td>
                  </tr>
                </tbody>
              </table>
              {focused && mode ? (
                <DecisionForm
                  title={mode === "reject" ? t("rejectTitle") : t("changesTitle")}
                  submitLabel={mode === "reject" ? t("reject") : t("changes")}
                  extraLabel={item.kind === "new" && mode === "reject" ? t("refundNow") : undefined}
                  busy={busy}
                  onSubmit={(input) => decide(item, mode, input)}
                  onCancel={() => setMode(null)}
                />
              ) : (
                <p className="admin-actions">
                  <button type="button" className="btn btn-rent" disabled={busy} onClick={() => decide(item, "approve")}>
                    {t("approve")} <kbd>A</kbd>
                  </button>{" "}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setFocus(index);
                      setMode("changes");
                    }}
                  >
                    {t("changes")} <kbd>E</kbd>
                  </button>{" "}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setFocus(index);
                      setMode("reject");
                    }}
                  >
                    {t("reject")} <kbd>R</kbd>
                  </button>
                </p>
              )}
            </div>
          </article>
        );
      })}
    </>
  );
}
