"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError, type OrderResponse, type RentConfig } from "./shared";

const MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const MAX_STAGE_W = 520;
const MAX_STAGE_H = 400;

interface View {
  scale: number;
  ox: number;
  oy: number;
}

/**
 * "Upload a picture": choose a file, frame it in the exact proportions of the
 * rented area (drag to move, slider or wheel to zoom), then the server crops,
 * scales (Lanczos) and cleans it.
 */
export function UploadEditor({
  order,
  config,
  width,
  height,
  onSaved,
}: {
  order: OrderResponse;
  config: RentConfig;
  width: number;
  height: number;
  onSaved: (order: OrderResponse) => void;
}) {
  const t = useTranslations("rent");
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const actualRef = useRef<HTMLCanvasElement>(null);
  const zoomedRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stage, setStage] = useState({ w: MAX_STAGE_W, h: Math.round(MAX_STAGE_W / (width / height)) });
  const [zoom, setZoom] = useState(1);
  const viewRef = useRef<View>({ scale: 1, ox: 0, oy: 0 });
  const [palette, setPalette] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnSmall, setWarnSmall] = useState(false);
  const accept = config.uploadFormats.map((f) => MIME[f]).filter(Boolean).join(",");

  // Stage size: the rented area's proportions, fitted into the column.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const aspect = width / height;
      let w = Math.min(MAX_STAGE_W, box.clientWidth || MAX_STAGE_W);
      let h = w / aspect;
      if (h > MAX_STAGE_H) {
        h = MAX_STAGE_H;
        w = h * aspect;
      }
      setStage({ w: Math.max(40, Math.round(w)), h: Math.max(40, Math.round(h)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [width, height]);

  const baseScale = useCallback(
    (img: HTMLImageElement) => Math.max(stage.w / img.naturalWidth, stage.h / img.naturalHeight),
    [stage],
  );

  const clampView = useCallback(
    (v: View, img: HTMLImageElement): View => {
      const iw = img.naturalWidth * v.scale;
      const ih = img.naturalHeight * v.scale;
      return {
        scale: v.scale,
        ox: Math.min(0, Math.max(stage.w - iw, v.ox)),
        oy: Math.min(0, Math.max(stage.h - ih, v.oy)),
      };
    },
    [stage],
  );

  const crop = useCallback(() => {
    const v = viewRef.current;
    return { x: -v.ox / v.scale, y: -v.oy / v.scale, w: stage.w / v.scale, h: stage.h / v.scale };
  }, [stage]);

  const draw = useCallback(() => {
    const canvas = stageRef.current;
    if (!canvas || !image) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(stage.w * dpr);
    canvas.height = Math.round(stage.h * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, stage.w, stage.h);
    ctx.imageSmoothingQuality = "high";
    const v = viewRef.current;
    ctx.drawImage(image, v.ox, v.oy, image.naturalWidth * v.scale, image.naturalHeight * v.scale);
    // Block grid, so people see how coarse the result will be.
    const cols = width / config.block_size_px;
    const rows = height / config.block_size_px;
    if (cols <= 60 && rows <= 60) {
      ctx.beginPath();
      for (let i = 1; i < cols; i++) {
        const x = Math.round((i * stage.w) / cols) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, stage.h);
      }
      for (let i = 1; i < rows; i++) {
        const y = Math.round((i * stage.h) / rows) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(stage.w, y);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Live preview at the real size (the server's Lanczos result is a little sharper).
    const c = crop();
    const actual = actualRef.current;
    const zoomed = zoomedRef.current;
    if (actual && zoomed) {
      actual.width = width;
      actual.height = height;
      const a = actual.getContext("2d")!;
      a.fillStyle = "#ffffff";
      a.fillRect(0, 0, width, height);
      a.imageSmoothingQuality = "high";
      a.drawImage(image, c.x, c.y, c.w, c.h, 0, 0, width, height);
      zoomed.width = width;
      zoomed.height = height;
      zoomed.getContext("2d")!.drawImage(actual, 0, 0);
    }
    setWarnSmall(Math.min(width, height) <= 40 && c.w / width > 4);
  }, [image, stage, width, height, config.block_size_px, crop]);

  const zoomRef = useRef(zoom);

  // A new picture or a new stage size: centre the picture at the current zoom.
  useEffect(() => {
    if (!image) return;
    const scale = baseScale(image) * zoomRef.current;
    viewRef.current = clampView(
      { scale, ox: (stage.w - image.naturalWidth * scale) / 2, oy: (stage.h - image.naturalHeight * scale) / 2 },
      image,
    );
    draw();
    // Only when a new picture or a new stage size arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, stage]);

  const setZoomKeepingCentre = (z: number) => {
    if (!image) return;
    const v = viewRef.current;
    const cx = (stage.w / 2 - v.ox) / v.scale;
    const cy = (stage.h / 2 - v.oy) / v.scale;
    const scale = baseScale(image) * z;
    viewRef.current = clampView({ scale, ox: stage.w / 2 - cx * scale, oy: stage.h / 2 - cy * scale }, image);
    zoomRef.current = z;
    setZoom(z);
    draw();
  };
  const setZoomKeepingCentreRef = useRef(setZoomKeepingCentre);
  useLayoutEffect(() => {
    setZoomKeepingCentreRef.current = setZoomKeepingCentre;
  });

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    const allowed = config.uploadFormats.map((x) => MIME[x]);
    if (!allowed.includes(f.type)) return setError("unsupported_format");
    if (f.size > config.uploadMaxMb * 1024 * 1024) return setError("too_large");
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > config.uploadMaxPx || img.naturalHeight > config.uploadMaxPx) {
        URL.revokeObjectURL(url);
        setError("too_many_pixels");
        return;
      }
      zoomRef.current = 1;
      setZoom(1);
      setFile(f);
      setImage(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("unreadable");
    };
    img.src = url;
  };

  // Dragging and wheel zoom on the stage.
  useEffect(() => {
    const canvas = stageRef.current;
    if (!canvas || !image) return;
    let start: { x: number; y: number; ox: number; oy: number } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, ox: viewRef.current.ox, oy: viewRef.current.oy };
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      viewRef.current = clampView(
        { scale: viewRef.current.scale, ox: start.ox + e.clientX - start.x, oy: start.oy + e.clientY - start.y },
        image,
      );
      draw();
    };
    const up = () => {
      start = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoomKeepingCentreRef.current(Math.min(8, Math.max(1, zoomRef.current * Math.exp(-e.deltaY * 0.002))));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [image, clampView, draw]);

  const save = async () => {
    if (!file || !image) return;
    setBusy(true);
    setError(null);
    try {
      const { path, upload } = await api<{ path: string; upload: { url: string; method: "PUT"; headers: Record<string, string> } }>(
        `/api/rentals/${order.id}/upload-url`,
        { method: "POST", body: JSON.stringify({ contentType: file.type, size: file.size }) },
      );
      const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file });
      if (!put.ok) throw new ApiError(put.status, put.status === 413 ? "too_large" : "upload_failed", {});
      const { order: fresh } = await api<{ order: OrderResponse }>(`/api/rentals/${order.id}/content`, {
        method: "POST",
        body: JSON.stringify({ kind: "upload", path, crop: crop(), palette }),
      });
      onSaved(fresh);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  const errorText = error ? (t.has(`contentErrors.${error}`) ? t(`contentErrors.${error}` as "contentErrors.error") : t("contentErrors.error")) : null;

  return (
    <div className="editor upload-editor" ref={boxRef}>
      <p>
        <label className="btn">
          {t("upload.choose")}
          <input type="file" accept={accept} className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>{" "}
        <span className="muted small">{t("upload.limits", { mb: config.uploadMaxMb, px: config.uploadMaxPx })}</span>
      </p>
      {errorText && (
        <p className="error" role="alert">
          {errorText}
        </p>
      )}
      {image && (
        <>
          <p className="muted">{t("upload.frameHelp")}</p>
          <canvas ref={stageRef} className="crop-stage" style={{ width: stage.w, height: stage.h }} aria-label={t("upload.frameLabel")} />
          <div className="field-row">
            <label>
              {t("upload.zoom")}{" "}
              <input type="range" min={1} max={8} step={0.05} value={zoom} onChange={(e) => setZoomKeepingCentre(Number(e.target.value))} />
            </label>
          </div>
          <fieldset className="field-row">
            <legend>{t("upload.retro")}</legend>
            {[0, 8, 16, 32].map((n) => (
              <label key={n}>
                <input type="radio" name="palette" checked={palette === n} onChange={() => setPalette(n)} />{" "}
                {n === 0 ? t("upload.retroOff") : t("upload.retroColours", { n })}
              </label>
            ))}
          </fieldset>
          <div className="preview">
            <figure>
              <canvas ref={actualRef} className="preview-actual" style={{ width, height }} />
              <figcaption>{t("previewActual")}</figcaption>
            </figure>
            <figure>
              <canvas
                ref={zoomedRef}
                className="preview-zoom"
                style={{
                  width: width * Math.max(1, Math.min(8, Math.floor(480 / width))),
                  height: height * Math.max(1, Math.min(8, Math.floor(480 / width))),
                }}
              />
              <figcaption>{t("previewZoom", { scale: Math.max(1, Math.min(8, Math.floor(480 / width))) })}</figcaption>
            </figure>
          </div>
          {warnSmall && <p className="warning">{t("upload.smallWarning")}</p>}
          <p className="muted small">{t("upload.processingNote")}</p>
          <p>
            <button type="button" className="btn btn-rent" onClick={save} disabled={busy}>
              {busy ? t("saving") : t("upload.use")}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
