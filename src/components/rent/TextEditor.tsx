"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "use-intl/react";
import { layoutText, MAX_TEXT_LENGTH, renderTextTile, type TextAlign, type TextTileParams } from "@/lib/content/text-tile";
import { api, ApiError, type OrderResponse } from "./shared";

const COLOURS = ["#ffffff", "#000000", "#e03131", "#f08c00", "#ffd43b", "#2f9e44", "#1971c2", "#7048e8", "#e64980", "#868e96", "#0c8599", "#5c3d1e"];

/** "Colour + text": a background colour with text in the 5 × 7 pixel font. */
export function TextEditor({ order, width, height, onSaved }: { order: OrderResponse; width: number; height: number; onSaved: (order: OrderResponse) => void }) {
  const t = useTranslations("rent");
  const saved = order.content?.kind === "text" ? (order.content.params as Partial<TextTileParams>) : null;
  const [params, setParams] = useState<TextTileParams>({
    background: saved?.background ?? "#ffd43b",
    color: saved?.color ?? "#000000",
    text: saved?.text ?? "",
    align: saved?.align ?? "center",
    scale: saved?.scale ?? 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actualRef = useRef<HTMLCanvasElement>(null);
  const zoomedRef = useRef<HTMLCanvasElement>(null);
  const layout = useMemo(() => layoutText(params, width, height), [params, width, height]);
  const oneBlock = Math.min(width, height) <= 10;
  const zoom = Math.max(1, Math.min(8, Math.floor(480 / width)));

  useEffect(() => {
    for (const canvas of [actualRef.current, zoomedRef.current]) {
      if (!canvas) continue;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      renderTextTile(params, width, height, (x, y, w, h, [r, g, b]) => {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, w, h);
      });
    }
  }, [params, width, height]);

  const update = (patch: Partial<TextTileParams>) => setParams((p) => ({ ...p, ...patch }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { order: fresh } = await api<{ order: OrderResponse }>(`/api/rentals/${order.id}/content`, {
        method: "POST",
        body: JSON.stringify({ kind: "text", params }),
      });
      onSaved(fresh);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  const colourPicker = (label: string, value: string, onChange: (v: string) => void) => (
    <fieldset className="field-row">
      <legend>{label}</legend>
      <div className="swatches">
        {COLOURS.map((c) => (
          <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={c} aria-pressed={value === c} onClick={() => onChange(c)} />
        ))}
      </div>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} /> <code>{value}</code>
    </fieldset>
  );

  return (
    <div className="editor text-editor">
      <label className="field">
        {t("text.text")}
        <textarea value={params.text} maxLength={MAX_TEXT_LENGTH} rows={3} onChange={(e) => update({ text: e.target.value })} placeholder={t("text.placeholder")} />
      </label>
      {colourPicker(t("text.background"), params.background, (background) => update({ background }))}
      {colourPicker(t("text.color"), params.color, (color) => update({ color }))}
      <div className="field-row">
        <fieldset className="field-row">
          <legend>{t("text.align")}</legend>
          {(["left", "center", "right"] as TextAlign[]).map((a) => (
            <label key={a}>
              <input type="radio" name="align" checked={params.align === a} onChange={() => update({ align: a })} /> {t(`text.${a}`)}
            </label>
          ))}
        </fieldset>
        <label>
          {t("text.size")}{" "}
          <select value={params.scale} onChange={(e) => update({ scale: Number(e.target.value) })}>
            <option value={0}>{t("text.sizeAuto")}</option>
            {[1, 2, 3, 4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
        </label>
      </div>
      {oneBlock && <p className="warning">{t("text.oneBlock")}</p>}
      {!layout.fits && <p className="warning">{t("text.tooLong")}</p>}
      <div className="preview">
        <figure>
          <canvas ref={actualRef} className="preview-actual" width={width} height={height} style={{ width }} />
          <figcaption>{t("previewActual")}</figcaption>
        </figure>
        <figure>
          <canvas ref={zoomedRef} className="preview-zoom" width={width} height={height} style={{ width: width * zoom }} />
          <figcaption>{t("previewZoom", { scale: zoom })}</figcaption>
        </figure>
      </div>
      {error && (
        <p className="error" role="alert">
          {t.has(`contentErrors.${error}`) ? t(`contentErrors.${error}` as "contentErrors.error") : t("contentErrors.error")}
        </p>
      )}
      <p>
        <button type="button" className="btn btn-rent" onClick={save} disabled={busy}>
          {busy ? t("saving") : t("text.use")}
        </button>
      </p>
    </div>
  );
}
