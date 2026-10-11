"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError, type OrderResponse } from "./shared";

type Tool = "pencil" | "eraser" | "fill" | "line" | "rect" | "picker";

/** DawnBringer 32: a well-known pixel-art palette. */
const PALETTE = [
  "#000000", "#222034", "#45283c", "#663931", "#8f563b", "#df7126", "#d9a066", "#eec39a",
  "#fbf236", "#99e550", "#6abe30", "#37946e", "#4b692f", "#524b24", "#323c39", "#3f3f74",
  "#306082", "#5b6ee1", "#639bff", "#5fcde4", "#cbdbfc", "#ffffff", "#9badb7", "#847e87",
  "#696a6a", "#595652", "#76428a", "#ac3232", "#d95763", "#d77bba", "#8f974a", "#8a6f30",
];
const WHITE = 0xffffffff;
const MAX_UNDO = 100;

interface Change {
  indices: Int32Array;
  before: Uint32Array;
  after: Uint32Array;
}

const hexToRgba = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  // Little-endian Uint32 view of RGBA bytes: 0xAABBGGRR.
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
};
const rgbaToHex = (v: number) => {
  const r = v & 0xff;
  const g = (v >> 8) & 0xff;
  const b = (v >> 16) & 0xff;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
};

function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}

/**
 * "Draw": a pixel editor whose canvas is exactly the rented size; every
 * pixel is a square cell. Works with mouse and finger.
 */
export function PixelEditor({ order, width, height, onSaved }: { order: OrderResponse; width: number; height: number; onSaved: (order: OrderResponse) => void }) {
  const t = useTranslations("rent");
  // Per size, not per order: the drawing survives "Change place" and a new reservation.
  const storageKey = `pw-draw-${width}x${height}`;
  const pixelsRef = useRef<Uint32Array>(new Uint32Array(width * height).fill(WHITE));
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const undoRef = useRef<Change[]>([]);
  const redoRef = useRef<Change[]>([]);
  const strokeRef = useRef<Map<number, number> | null>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [size, setSize] = useState(1);
  const [color, setColor] = useState("#000000");
  const [recent, setRecent] = useState<string[]>([]);
  const [grid, setGrid] = useState(true);
  const fitCell = Math.max(1, Math.min(32, Math.floor(Math.min(560 / width, 420 / height))));
  const [cell, setCell] = useState(fitCell);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<{ from: [number, number]; to: [number, number] } | null>(null);

  const render = useCallback(() => {
    if (!sourceRef.current) {
      sourceRef.current = document.createElement("canvas");
      sourceRef.current.width = width;
      sourceRef.current.height = height;
    }
    const src = sourceRef.current;
    const sctx = src.getContext("2d")!;
    // A view on the same memory, no copy (pixels are RGBA bytes, read as little-endian 32-bit words).
    sctx.putImageData(new ImageData(new Uint8ClampedArray(pixelsRef.current.buffer as ArrayBuffer), width, height), 0, 0);

    const view = viewRef.current;
    if (!view) return;
    const dpr = window.devicePixelRatio || 1;
    view.width = Math.round(width * cell * dpr);
    view.height = Math.round(height * cell * dpr);
    const ctx = view.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, view.width, view.height);
    const s = cell * dpr;
    // Line and rectangle previews while dragging.
    const p = previewRef.current;
    if (p) {
      ctx.fillStyle = color;
      const pts =
        tool === "line"
          ? linePoints(p.from[0], p.from[1], p.to[0], p.to[1])
          : rectPoints(p.from[0], p.from[1], p.to[0], p.to[1]);
      const off = Math.floor((size - 1) / 2);
      for (const [x, y] of pts) ctx.fillRect((x - off) * s, (y - off) * s, s * size, s * size);
    }
    if (grid && cell >= 6) {
      ctx.beginPath();
      for (let x = 1; x < width; x++) {
        ctx.moveTo(Math.round(x * s) + 0.5, 0);
        ctx.lineTo(Math.round(x * s) + 0.5, view.height);
      }
      for (let y = 1; y < height; y++) {
        ctx.moveTo(0, Math.round(y * s) + 0.5);
        ctx.lineTo(view.width, Math.round(y * s) + 0.5);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [width, height, cell, grid, color, tool, size]);

  // Restore an unfinished drawing kept in this browser.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      raw = null;
    }
    if (!raw) {
      render();
      return;
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      pixelsRef.current = new Uint32Array(ctx.getImageData(0, 0, width, height).data.buffer.slice(0));
      render();
    };
    img.onerror = () => render();
    img.src = raw;
    // Only once per size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useLayoutEffect(() => {
    render();
  }, [render]);

  const autosave = useRef(0);
  const scheduleSave = useCallback(() => {
    window.clearTimeout(autosave.current);
    autosave.current = window.setTimeout(() => {
      try {
        render();
        const url = sourceRef.current?.toDataURL("image/png");
        if (url && url.length < 3_000_000) window.localStorage.setItem(storageKey, url);
      } catch {
        // Storage full or blocked: the editor keeps working without it.
      }
    }, 800);
  }, [render, storageKey]);

  const set = (x: number, y: number, value: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    const stroke = strokeRef.current;
    if (stroke && !stroke.has(i)) stroke.set(i, pixelsRef.current[i]);
    pixelsRef.current[i] = value;
  };
  const stamp = (x: number, y: number, value: number) => {
    const off = Math.floor((size - 1) / 2);
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) set(x - off + xx, y - off + yy, value);
  };

  const beginChange = () => {
    strokeRef.current = new Map();
  };
  const commitChange = () => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || stroke.size === 0) return;
    const indices = Int32Array.from(stroke.keys());
    const before = Uint32Array.from(stroke.values());
    const after = Uint32Array.from(indices, (i) => pixelsRef.current[i]);
    undoRef.current.push({ indices, before, after });
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift();
    redoRef.current = [];
    setHistory({ undo: undoRef.current.length, redo: 0 });
    scheduleSave();
  };
  const applyChange = (from: Change[], to: Change[], useBefore: boolean) => {
    const change = from.pop();
    if (!change) return;
    const values = useBefore ? change.before : change.after;
    change.indices.forEach((idx, k) => (pixelsRef.current[idx] = values[k]));
    to.push(change);
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
    render();
    scheduleSave();
  };

  const chooseColor = useCallback((hex: string) => {
    setColor(hex);
    setRecent((r) => [hex, ...r.filter((c) => c !== hex)].slice(0, 8));
  }, []);

  // The pointer handlers below read the current tool and colour from here.
  const toolRefs = useRef({ tool, color });
  useLayoutEffect(() => {
    toolRefs.current = { tool, color };
  });

  const floodFill = (x: number, y: number, value: number) => {
    const px = pixelsRef.current;
    const target = px[y * width + x];
    if (target === value) return;
    const stack = [y * width + x];
    while (stack.length) {
      const i = stack.pop()!;
      if (px[i] !== target) continue;
      set(i % width, Math.floor(i / width), value);
      const cx = i % width;
      if (cx > 0) stack.push(i - 1);
      if (cx < width - 1) stack.push(i + 1);
      if (i >= width) stack.push(i - width);
      if (i < width * (height - 1)) stack.push(i + width);
    }
  };

  // Pointer input on the drawing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    let last: [number, number] | null = null;
    let start: [number, number] | null = null;
    const at = (e: PointerEvent): [number, number] => {
      const r = view.getBoundingClientRect();
      return [
        Math.min(width - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * width))),
        Math.min(height - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * height))),
      ];
    };
    const valueFor = () => (toolRefs.current.tool === "eraser" ? WHITE : hexToRgba(toolRefs.current.color));
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      view.setPointerCapture(e.pointerId);
      const p = at(e);
      const current = toolRefs.current.tool;
      if (current === "picker") {
        chooseColor(rgbaToHex(pixelsRef.current[p[1] * width + p[0]]));
        setTool("pencil");
        return;
      }
      beginChange();
      if (current === "fill") {
        floodFill(p[0], p[1], valueFor());
        commitChange();
        render();
        return;
      }
      start = p;
      last = p;
      if (current === "pencil" || current === "eraser") {
        stamp(p[0], p[1], valueFor());
        render();
      }
    };
    const move = (e: PointerEvent) => {
      if (!start || !last) return;
      const p = at(e);
      const current = toolRefs.current.tool;
      if (current === "pencil" || current === "eraser") {
        for (const [x, y] of linePoints(last[0], last[1], p[0], p[1])) stamp(x, y, valueFor());
        last = p;
        render();
      } else {
        previewRef.current = { from: start, to: p };
        render();
      }
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const p = at(e);
      const current = toolRefs.current.tool;
      if (current === "line") for (const [x, y] of linePoints(start[0], start[1], p[0], p[1])) stamp(x, y, valueFor());
      if (current === "rect") for (const [x, y] of rectPoints(start[0], start[1], p[0], p[1])) stamp(x, y, valueFor());
      previewRef.current = null;
      start = null;
      last = null;
      commitChange();
      render();
    };
    view.addEventListener("pointerdown", down);
    view.addEventListener("pointermove", move);
    view.addEventListener("pointerup", up);
    view.addEventListener("pointercancel", up);
    return () => {
      view.removeEventListener("pointerdown", down);
      view.removeEventListener("pointermove", move);
      view.removeEventListener("pointerup", up);
      view.removeEventListener("pointercancel", up);
    };
    // The handlers read the current tool through toolRefs; the drawing helpers only touch refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, render, chooseColor]);

  const clearAll = () => {
    beginChange();
    for (let i = 0; i < pixelsRef.current.length; i++) set(i % width, Math.floor(i / width), WHITE);
    commitChange();
    render();
  };

  const importImage = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Cover the whole area, like the upload crop does by default.
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = "high";
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      const data = new Uint32Array(ctx.getImageData(0, 0, width, height).data.buffer.slice(0));
      beginChange();
      data.forEach((v, i) => set(i % width, Math.floor(i / width), (v | 0xff000000) >>> 0));
      commitChange();
      render();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("unreadable");
    };
    img.src = url;
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      render();
      const blob = await new Promise<Blob | null>((resolve) => sourceRef.current!.toBlob(resolve, "image/png"));
      if (!blob) throw new ApiError(0, "error", {});
      const form = new FormData();
      form.set("kind", "draw");
      form.set("file", blob, "drawing.png");
      // The drawing stays in this browser, so it can still be changed after saving.
      const { order: fresh } = await api<{ order: OrderResponse }>(`/api/rentals/${order.id}/content`, { method: "POST", body: form });
      onSaved(fresh);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  const tools: Tool[] = ["pencil", "eraser", "fill", "line", "rect", "picker"];
  const errorText = error ? (t.has(`contentErrors.${error}`) ? t(`contentErrors.${error}` as "contentErrors.error") : t("contentErrors.error")) : null;

  return (
    <div className="editor pixel-editor">
      <div className="editor-bar" role="toolbar" aria-label={t("draw.tools")}>
        {tools.map((k) => (
          <button key={k} type="button" className="btn" aria-pressed={tool === k} onClick={() => setTool(k)}>
            {t(`draw.${k}`)}
          </button>
        ))}
        <label>
          {t("draw.size")}{" "}
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} px
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="editor-bar">
        <div className="swatches" role="group" aria-label={t("draw.palette")}>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => chooseColor(c)}
            />
          ))}
        </div>
        <label>
          {t("draw.hex")}{" "}
          <input
            type="color"
            value={color}
            onChange={(e) => chooseColor(e.target.value)}
            aria-label={t("draw.hex")}
          />{" "}
          <code>{color}</code>
        </label>
        {recent.length > 0 && (
          <div className="swatches" role="group" aria-label={t("draw.recent")}>
            <span className="muted small">{t("draw.recent")}:</span>
            {recent.map((c) => (
              <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={c} onClick={() => chooseColor(c)} />
            ))}
          </div>
        )}
      </div>
      <div className="editor-bar">
        <button type="button" className="btn" disabled={history.undo === 0} onClick={() => applyChange(undoRef.current, redoRef.current, true)}>
          {t("draw.undo")}
        </button>
        <button type="button" className="btn" disabled={history.redo === 0} onClick={() => applyChange(redoRef.current, undoRef.current, false)}>
          {t("draw.redo")}
        </button>
        <button type="button" className="btn" onClick={clearAll}>
          {t("draw.clear")}
        </button>
        <label className="btn">
          {t("draw.import")}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="visually-hidden" onChange={(e) => importImage(e.target.files?.[0])} />
        </label>
        <label className="tb-check">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> {t("draw.grid")}
        </label>
        <button type="button" className="btn btn-icon" onClick={() => setCell((c) => Math.max(1, c - (c > 8 ? 4 : 1)))} aria-label={t("draw.zoomOut")}>
          −
        </button>
        <button type="button" className="btn btn-icon" onClick={() => setCell((c) => Math.min(48, c + (c >= 8 ? 4 : 1)))} aria-label={t("draw.zoomIn")}>
          +
        </button>
      </div>
      <div className="pixel-canvas-wrap">
        <canvas
          ref={viewRef}
          className="pixel-canvas"
          style={{ width: width * cell, height: height * cell }}
          aria-label={t("draw.canvasLabel", { w: width, h: height })}
        />
      </div>
      <p className="muted small">{t("draw.autosave")}</p>
      {errorText && (
        <p className="error" role="alert">
          {errorText}
        </p>
      )}
      <p>
        <button type="button" className="btn btn-rent" onClick={save} disabled={busy}>
          {busy ? t("saving") : t("draw.use")}
        </button>
      </p>
    </div>
  );
}

function rectPoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = [];
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let x = ax; x <= bx; x++) points.push([x, ay], [x, by]);
  for (let y = ay + 1; y < by; y++) points.push([ax, y], [bx, y]);
  return points;
}
