"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "use-intl/react";
import { pixelRange } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { displayDomain } from "@/lib/url";
import { api, ApiError, type OrderResponse, type RentConfig, type Step } from "./shared";

const PREVIEW_W = 480;

/** Step 5 of the spec: the content placed into the current wall, the details and the server's price. */
export function SummaryStep({
  order,
  config,
  wallImage,
  onEdit,
}: {
  order: OrderResponse;
  config: RentConfig;
  wallImage: string | null;
  onEdit: (step: Step) => void;
}) {
  const t = useTranslations("rent");
  const intlLocale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const block = config.block_size_px;
  const r = order.rect;
  const range = pixelRange(r, block);
  const q = order.quotes.find((x) => x.years === order.periodYears) ?? null;
  const money = (cents: number) => formatMoney(cents, config.currency, intlLocale);

  // The neighbourhood of the spot, with the new content drawn in and outlined.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !order.previewUrl || !order.content) return;
    const margin = Math.max(6, Math.ceil(Math.max(r.w, r.h) * 0.75));
    const area = {
      x: Math.max(0, r.x - margin),
      y: Math.max(0, r.y - margin),
      x1: Math.min(config.cols, r.x + r.w + margin),
      y1: Math.min(config.rows, r.y + r.h + margin),
    };
    const srcW = (area.x1 - area.x) * block;
    const srcH = (area.y1 - area.y) * block;
    // Whole-number enlargement keeps pixels square; big areas are shrunk to fit instead.
    const scale = srcW <= PREVIEW_W ? Math.floor(PREVIEW_W / srcW) : PREVIEW_W / srcW;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(srcW * scale * dpr);
    canvas.height = Math.round(srcH * scale * dpr);
    // Only the width: the CSS height (auto) keeps the proportions when a narrow screen shrinks it.
    canvas.style.width = `${Math.round(srcW * scale)}px`;
    const ctx = canvas.getContext("2d")!;
    const s = scale * dpr;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let cancelled = false;
    const content = new Image();
    const drawContent = () => {
      if (cancelled) return;
      ctx.clearRect((r.x - area.x) * block * s, (r.y - area.y) * block * s, r.w * block * s, r.h * block * s);
      ctx.drawImage(content, (r.x - area.x) * block * s, (r.y - area.y) * block * s, r.w * block * s, r.h * block * s);
      ctx.strokeStyle = "#1971c2";
      ctx.lineWidth = Math.max(1, Math.round(2 * dpr));
      ctx.strokeRect((r.x - area.x) * block * s - 1, (r.y - area.y) * block * s - 1, r.w * block * s + 2, r.h * block * s + 2);
    };
    content.onload = () => {
      if (!wallImage) return drawContent();
      const wall = new Image();
      wall.onload = () => {
        if (cancelled) return;
        ctx.drawImage(wall, area.x * block, area.y * block, srcW, srcH, 0, 0, canvas.width, canvas.height);
        drawContent();
      };
      wall.onerror = drawContent;
      wall.src = wallImage;
    };
    content.src = `${order.previewUrl}?v=${order.content.id}`;
    return () => {
      cancelled = true;
    };
  }, [order, wallImage, r.x, r.y, r.w, r.h, block, config.cols, config.rows]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ rentalId: order.id }) });
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
      setBusy(false);
    }
  };

  return (
    <div className="rent-summary">
      <h2>{t("summaryTitle")}</h2>
      <div className="summary-grid">
        <figure className="summary-preview">
          <canvas ref={canvasRef} aria-label={t("summaryPreview")} />
          <figcaption>{t("summaryPreview")}</figcaption>
        </figure>
        <div>
          <table className="data">
            <tbody>
              <tr>
                <th scope="row">{t("fields.title")}</th>
                <td>{order.content?.title}</td>
              </tr>
              <tr>
                <th scope="row">{t("fields.url")}</th>
                <td>{order.content?.url ? displayDomain(order.content.url) : "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("fields.displayName")}</th>
                <td>{order.content?.displayName ?? "—"}</td>
              </tr>
              <tr>
                <th scope="row">{t("positionLabel")}</th>
                <td>{t("position", { x0: range.x0, x1: range.x1, y0: range.y0, y1: range.y1 })}</td>
              </tr>
              <tr>
                <th scope="row">{t("size")}</th>
                <td>{t("sizeValue", { w: r.w * block, h: r.h * block, bw: r.w, bh: r.h })}</td>
              </tr>
              <tr>
                <th scope="row">{t("fields.period")}</th>
                <td>{t("years", { years: order.periodYears ?? 1 })}</td>
              </tr>
              <tr>
                <th scope="row">{t("fields.email")}</th>
                <td>{order.email}</td>
              </tr>
            </tbody>
          </table>
          <p>
            <button type="button" className="link-button" onClick={() => onEdit("content")}>
              {t("editContent")}
            </button>{" "}
            |{" "}
            <button type="button" className="link-button" onClick={() => onEdit("details")}>
              {t("editDetails")}
            </button>
          </p>

          {q && (
            <table className="data price-table">
              <tbody>
                <tr>
                  <th scope="row">{t("pricePerYear")}</th>
                  <td>{money(q.perYearCents)}</td>
                </tr>
                <tr>
                  <th scope="row">{t("priceYears", { years: q.years })}</th>
                  <td>{money(q.subtotalCents)}</td>
                </tr>
                {q.discountCents > 0 && (
                  <tr>
                    <th scope="row">{t("priceDiscount", { pct: q.discountPct })}</th>
                    <td>−{money(q.discountCents)}</td>
                  </tr>
                )}
                <tr className="total">
                  <th scope="row">{t("priceTotal")}</th>
                  <td>{money(q.totalCents)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="muted small">{config.vat_payer ? t("vatIncluded", { rate: config.vat_rate_pct }) : t("notVatPayer")}</p>
          {error && (
            <p className="error" role="alert">
              {t.has(`payErrors.${error}`) ? t(`payErrors.${error}` as "payErrors.error") : t("payErrors.error")}
            </p>
          )}
          <p>
            <button type="button" className="btn btn-rent btn-big" onClick={pay} disabled={busy || !q || config.salesPaused}>
              {busy ? t("redirecting") : t("pay", { price: q ? money(q.totalCents) : "" })}
            </button>
          </p>
          <p className="muted small">{t("payNote", { hours: config.reviewHours })}</p>
          {config.devPayments && <p className="notice small">{t("devPaymentNote")}</p>}
        </div>
      </div>
    </div>
  );
}
