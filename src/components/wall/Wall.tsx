"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "use-intl/react";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import type { WallSnapshot } from "@/lib/wall/snapshot";
import { createFreeLayer, drawLoupe, drawWall, type Overlay } from "./draw";
import { areaRect, buildModel, hitAt, imageMapHtml, rentalRect, searchRentals, type Hit, type WallModel } from "./model";
import {
  centerOn,
  clampView,
  clampZoom,
  fitOf,
  lerpView,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  stepZoom,
  toScreen,
  toWall,
  zoomAt,
  zoomForRect,
  ZOOM_LEVELS,
  type Dims,
  type View,
} from "./view";
import { WallPopup, type PopupState } from "./WallPopup";

export interface WallProps {
  initial: WallSnapshot;
  blockPriceCents: number;
  currency: string;
  /** Admin switch: on desktop, a click on a rental opens its link directly (like the original). */
  directLinkOpen: boolean;
}

interface Tip {
  hit: Hit;
}

const LOUPE_SIZE = 168;
const POLL_MS = 60_000;
const SHEET_BELOW = 560;

/**
 * The interactive wall: canvas rendering over the server-rendered image and
 * image map, zoom (wheel, buttons, pinch, double tap), pan, magnifier,
 * hover bubble, spot windows, search, random spot and shareable positions.
 */
export function Wall({ initial, blockPriceCents, currency, directLinkOpen }: WallProps) {
  const t = useTranslations("wall");
  const locale = useAppLocale();
  const format = useFormatter();

  const [snapshot, setSnapshot] = useState(initial);
  const model = useMemo(() => buildModel(snapshot), [snapshot]);
  const mapHtml = useMemo(() => imageMapHtml(snapshot.rentals, snapshot.block), [snapshot]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const modelRef = useRef<WallModel>(model);
  const viewRef = useRef<View>({ zoom: 1, ox: 0, oy: 0 });
  const sizeRef = useRef({ frameW: 0, frameH: 0, dpr: 1 });
  const overlayRef = useRef<Overlay>({ hover: null, selected: null, cursor: null, showFree: false });
  const imageRef = useRef<HTMLImageElement | null>(null);
  const freeLayerRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const animRef = useRef(0);
  const hoverKeyRef = useRef<string | null>(null);
  const loupePointRef = useRef<{ x: number; y: number; touch: boolean } | null>(null);
  const keyboardRef = useRef(false);
  const settingsRef = useRef({ directLinkOpen, magnifier: false });
  const tRef = useRef(t);
  const zoomUiTimer = useRef(0);
  const tipSizeRef = useRef({ w: 0, h: 0 });
  const popupSizeRef = useRef({ w: 0, h: 0 });
  const tipPointRef = useRef({ x: 0, y: 0 });

  const [imageReady, setImageReady] = useState(false);
  const [zoomUi, setZoomUi] = useState(1);
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [sheet, setSheet] = useState(false);
  const sheetRef = useRef(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [magnifier, setMagnifier] = useState(false);
  const [loupeVisible, setLoupeVisible] = useState(false);
  const [showFree, setShowFree] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<number[] | null>(null);
  const [searchedFor, setSearchedFor] = useState("");
  const [announcement, setAnnouncement] = useState("");

  useLayoutEffect(() => {
    tRef.current = t;
    settingsRef.current.directLinkOpen = directLinkOpen;
    settingsRef.current.magnifier = magnifier;
  });

  const dims = useCallback((): Dims => {
    const m = modelRef.current;
    return { wallW: m.width, wallH: m.height, frameW: sizeRef.current.frameW, frameH: sizeRef.current.frameH };
  }, []);

  // ---------------------------------------------------------------- drawing

  const drawLoupeNow = useCallback(() => {
    const point = loupePointRef.current;
    const canvas = loupeCanvasRef.current;
    const box = loupeRef.current;
    if (!point || !canvas || !box) return;
    const d = dims();
    const { wx, wy } = toWall(viewRef.current, d, point.x, point.y);
    const dpr = sizeRef.current.dpr;
    const size = Math.round(LOUPE_SIZE * dpr);
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 6× the 100 % view, and always at least twice what is on screen right now.
    const fit = fitOf(d);
    const magnification = Math.min(48, Math.max(fit * 6, fit * viewRef.current.zoom * 2));
    drawLoupe(ctx, imageRef.current, modelRef.current, wx, wy, magnification, dpr);
    const offsetY = point.touch ? -LOUPE_SIZE / 2 - 36 : 0;
    const left = Math.round(point.x - LOUPE_SIZE / 2);
    const top = Math.round(point.y - LOUPE_SIZE / 2 + offsetY);
    box.style.transform = `translate(${left}px, ${top}px)`;
  }, [dims]);

  /** Keep the spot window next to the selected spot (right, left, below or above it). */
  const placePopup = useCallback(() => {
    const box = popupRef.current;
    const sel = overlayRef.current.selected;
    if (!box || !sel) return;
    if (sheetRef.current) {
      // Phones: the window is a sheet at the bottom of the screen (CSS).
      box.style.left = "";
      box.style.top = "";
      return;
    }
    const d = dims();
    const m = modelRef.current;
    const a = toScreen(viewRef.current, d, sel.x * m.block, sel.y * m.block);
    const b = toScreen(viewRef.current, d, (sel.x + sel.w) * m.block, (sel.y + sel.h) * m.block);
    const { w, h } = popupSizeRef.current;
    const gap = 10;
    const W = d.frameW;
    const H = d.frameH;
    const clampX = (x: number) => Math.min(Math.max(4, x), Math.max(4, W - w - 4));
    const clampY = (y: number) => Math.min(Math.max(4, y), Math.max(4, H - h - 4));
    const candidates = [
      { left: b.sx + gap, top: clampY(a.sy), ok: b.sx + gap + w <= W - 4 },
      { left: a.sx - gap - w, top: clampY(a.sy), ok: a.sx - gap - w >= 4 },
      { left: clampX(a.sx), top: b.sy + gap, ok: b.sy + gap + h <= H - 4 },
      { left: clampX(a.sx), top: a.sy - gap - h, ok: a.sy - gap - h >= 4 },
    ];
    // The spot fills the whole view: put the window in the bottom-right corner.
    const pick = candidates.find((c) => c.ok) ?? { left: W - w - 8, top: H - h - 8 };
    // +1: the frame's border.
    box.style.left = `${Math.round(Math.max(4, pick.left)) + 1}px`;
    box.style.top = `${Math.round(Math.max(4, pick.top)) + 1}px`;
  }, [dims]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const { frameW, dpr } = sizeRef.current;
    if (!canvas || !ctx || !frameW) return;
    const overlay = overlayRef.current;
    drawWall(ctx, imageRef.current, modelRef.current, viewRef.current, dims(), dpr, overlay, overlay.showFree ? freeLayerRef.current : null);
    if (loupePointRef.current) drawLoupeNow();
    placePopup();
  }, [dims, drawLoupeNow, placePopup]);

  const requestDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  const commitZoomUi = useCallback(() => {
    window.clearTimeout(zoomUiTimer.current);
    zoomUiTimer.current = 0;
    setZoomUi(Math.round(viewRef.current.zoom * 100) / 100);
  }, []);

  const updateKeyboardCursor = useCallback(() => {
    if (!keyboardRef.current) return;
    const d = dims();
    const m = modelRef.current;
    const { wx, wy } = toWall(viewRef.current, d, d.frameW / 2, d.frameH / 2);
    overlayRef.current.cursor = {
      bx: Math.min(m.cols - 1, Math.max(0, Math.floor(wx / m.block))),
      by: Math.min(m.rows - 1, Math.max(0, Math.floor(wy / m.block))),
    };
  }, [dims]);

  const setView = useCallback(
    (next: View) => {
      viewRef.current = clampView(next, dims());
      updateKeyboardCursor();
      requestDraw();
      // Update the zoom buttons at most ~8× per second during gestures.
      if (!zoomUiTimer.current) zoomUiTimer.current = window.setTimeout(commitZoomUi, 120);
    },
    [commitZoomUi, dims, requestDraw, updateKeyboardCursor],
  );

  const cancelAnimation = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    animRef.current = 0;
  }, []);

  const animateTo = useCallback(
    (target: View, duration = 240, onDone?: () => void) => {
      cancelAnimation();
      const d = dims();
      const from = viewRef.current;
      const to = clampView(target, d);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce || duration <= 0) {
        setView(to);
        commitZoomUi();
        onDone?.();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setView(lerpView(from, to, eased, d));
        if (p < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          animRef.current = 0;
          setView(to);
          commitZoomUi();
          onDone?.();
        }
      };
      animRef.current = requestAnimationFrame(step);
    },
    [cancelAnimation, commitZoomUi, dims, setView],
  );

  // ----------------------------------------------------------- data & image

  useLayoutEffect(() => {
    modelRef.current = model;
    freeLayerRef.current = overlayRef.current.showFree ? createFreeLayer(model) : null;
    hoverKeyRef.current = null;
    overlayRef.current.hover = null;
    requestDraw();
  }, [model, requestDraw]);

  // Keep an open window pointing at the same rental after the data refreshes.
  useEffect(() => {
    setPopup((current) => {
      if (!current || current.no == null) return current;
      const index = model.byNumber.get(current.no);
      if (index === undefined) {
        overlayRef.current.selected = null;
        return null;
      }
      return current.hit.kind === "rental" && current.hit.index === index ? current : { ...current, hit: { kind: "rental", index } };
    });
  }, [model]);

  const imageUrl = snapshot.image?.webp ?? null;
  const fallbackUrl = snapshot.image?.png ?? null;
  useEffect(() => {
    if (!imageUrl) {
      imageRef.current = null;
      requestDraw();
      return;
    }
    let cancelled = false;
    let triedFallback = false;
    // No crossOrigin: the canvas only draws the image and never reads its pixels,
    // so the wall works whatever CORS headers the storage sends.
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      setImageReady(true);
      requestDraw();
    };
    img.onerror = () => {
      if (cancelled) return;
      if (!triedFallback && fallbackUrl) {
        triedFallback = true;
        img.src = fallbackUrl;
      }
      // Otherwise the canvas stays transparent and the plain <img> shows whatever it could load.
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl, fallbackUrl, requestDraw]);

  // Fresh data every minute while the tab is visible.
  useEffect(() => {
    let last = JSON.stringify(initial);
    let busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/wall.json", { cache: "no-store" });
        if (!res.ok) return;
        const text = await res.text();
        if (text !== last) {
          last = text;
          setSnapshot(JSON.parse(text) as WallSnapshot);
        }
      } catch {
        // Offline or server busy: try again next time.
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial]);

  // -------------------------------------------------------------- sizing

  useLayoutEffect(() => {
    const el = viewportRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    let mq: MediaQueryList | null = null;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const prev = { ...sizeRef.current };
      if (rect.width === prev.frameW && rect.height === prev.frameH && dpr === prev.dpr) return;
      // Keep the same wall point in the middle when the frame is resized.
      let center: { wx: number; wy: number } | null = null;
      if (prev.frameW > 0) center = toWall(viewRef.current, dims(), prev.frameW / 2, prev.frameH / 2);
      sizeRef.current = { frameW: rect.width, frameH: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      viewRef.current = center ? centerOn(dims(), center.wx, center.wy, viewRef.current.zoom) : clampView(viewRef.current, dims());
      sheetRef.current = rect.width < SHEET_BELOW;
      setSheet(sheetRef.current);
      draw();
      watchDpr();
    };
    const watchDpr = () => {
      mq?.removeEventListener("change", apply);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener("change", apply);
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => {
      ro.disconnect();
      mq?.removeEventListener("change", apply);
    };
  }, [dims, draw]);

  // --------------------------------------------------------------- actions

  const blockAt = useCallback(
    (x: number, y: number) => {
      const m = modelRef.current;
      const { wx, wy } = toWall(viewRef.current, dims(), x, y);
      if (wx < 0 || wy < 0 || wx >= m.width || wy >= m.height) return null;
      return { wx, wy, bx: Math.floor(wx / m.block), by: Math.floor(wy / m.block) };
    },
    [dims],
  );

  const showCoords = useCallback((at: { bx: number; by: number; wx: number; wy: number } | null) => {
    const el = coordsRef.current;
    if (!el) return;
    el.textContent = at
      ? tRef.current("coords", { bx: at.bx, by: at.by, px: Math.floor(at.wx), py: Math.floor(at.wy) })
      : tRef.current("coordsIdle");
    el.dataset.idle = at ? "" : "1";
  }, []);

  const closePopup = useCallback(() => {
    setPopup(null);
    overlayRef.current.selected = null;
    requestDraw();
  }, [requestDraw]);

  const openPopup = useCallback(
    (hit: Hit, bx: number, by: number, viaKeyboard = false) => {
      const m = modelRef.current;
      overlayRef.current.selected = areaRect(m, hit, bx, by);
      const no = hit.kind === "rental" ? m.rentals[hit.index][0] : null;
      setPopup({ hit, bx, by, viaKeyboard, no });
      // Hide the bubble until the pointer moves to another spot.
      setTip(null);
      requestDraw();
      if (no != null) {
        try {
          navigator.sendBeacon?.(`/api/track/open?no=${no}`);
        } catch {
          // Statistics are best effort.
        }
      }
    },
    [requestDraw],
  );

  const handleTap = useCallback(
    (x: number, y: number, pointerType: string) => {
      const at = blockAt(x, y);
      if (!at) {
        closePopup();
        return;
      }
      showCoords(at);
      const m = modelRef.current;
      const hit = hitAt(m, at.bx, at.by)!;
      if (hit.kind === "rental" && pointerType === "mouse" && settingsRef.current.directLinkOpen && m.rentals[hit.index][7]) {
        window.open(`/go/${m.rentals[hit.index][0]}`, "_blank", "noopener,noreferrer");
        return;
      }
      openPopup(hit, at.bx, at.by);
    },
    [blockAt, closePopup, openPopup, showCoords],
  );

  const zoomToLevel = useCallback(
    (zoom: number, at?: { x: number; y: number }) => {
      const d = dims();
      const point = at ?? { x: d.frameW / 2, y: d.frameH / 2 };
      animateTo(zoomAt(viewRef.current, d, clampZoom(zoom), point.x, point.y));
    },
    [animateTo, dims],
  );

  const toggleZoomAt = useCallback(
    (x: number, y: number) => {
      closePopup();
      zoomToLevel(viewRef.current.zoom < 4 - 0.01 ? 4 : MIN_ZOOM, { x, y });
    },
    [closePopup, zoomToLevel],
  );

  /** Bring a rental into view, highlight it and open its window. */
  const focusRental = useCallback(
    (index: number) => {
      const m = modelRef.current;
      const row = m.rentals[index];
      if (!row) return;
      const rect = rentalRect(row);
      const d = dims();
      const zoom = zoomForRect(d, rect.w * m.block, rect.h * m.block);
      const target = centerOn(d, (rect.x + rect.w / 2) * m.block, (rect.y + rect.h / 2) * m.block, zoom);
      overlayRef.current.selected = rect;
      setResults(null);
      // Make sure the spot is visible in the browser window too.
      const frameTop = viewportRef.current!.getBoundingClientRect().top + window.scrollY;
      const spotY = frameTop + toScreen(target, d, (rect.x + rect.w / 2) * m.block, (rect.y + rect.h / 2) * m.block).sy;
      if (spotY < window.scrollY + 80 || spotY > window.scrollY + window.innerHeight - 160) {
        window.scrollTo({ top: Math.max(0, spotY - window.innerHeight / 2), behavior: "smooth" });
      }
      animateTo(target, 320, () => openPopup({ kind: "rental", index }, rect.x, rect.y));
    },
    [animateTo, dims, openPopup],
  );

  const randomSpot = useCallback(() => {
    const m = modelRef.current;
    if (m.rentals.length === 0) return;
    focusRental(Math.floor(Math.random() * m.rentals.length));
  }, [focusRental]);

  const shareUrl = useCallback(
    (index: number) => {
      const m = modelRef.current;
      const rect = rentalRect(m.rentals[index]);
      const zoom = Math.max(2, zoomForRect(dims(), rect.w * m.block, rect.h * m.block));
      const url = new URL(localePath(locale, "/"), window.location.origin);
      url.searchParams.set("x", String(rect.x));
      url.searchParams.set("y", String(rect.y));
      url.searchParams.set("zoom", String(zoom));
      return url.toString();
    },
    [dims, locale],
  );

  const toggleShowFree = useCallback(
    (on: boolean) => {
      setShowFree(on);
      overlayRef.current.showFree = on;
      freeLayerRef.current = on ? createFreeLayer(modelRef.current) : null;
      requestDraw();
    },
    [requestDraw],
  );

  const hideLoupe = useCallback(() => {
    loupePointRef.current = null;
    setLoupeVisible(false);
  }, []);

  const showLoupeAt = useCallback(
    (x: number, y: number, touch: boolean) => {
      loupePointRef.current = { x, y, touch };
      setLoupeVisible(true);
      drawLoupeNow();
    },
    [drawLoupeNow],
  );

  const toggleMagnifier = useCallback(() => {
    setMagnifier((on) => {
      if (on) hideLoupe();
      return !on;
    });
  }, [hideLoupe]);

  // -------------------------------------------------------- hover bubble

  const clearHover = useCallback(() => {
    hoverKeyRef.current = null;
    overlayRef.current.hover = null;
    setTip(null);
    showCoords(null);
    if (viewportRef.current) viewportRef.current.dataset.over = "";
    if (loupePointRef.current && !loupePointRef.current.touch) hideLoupe();
    requestDraw();
  }, [hideLoupe, requestDraw, showCoords]);

  const positionTip = useCallback((x: number, y: number) => {
    const tipEl = tipRef.current;
    if (!tipEl) return;
    tipPointRef.current = { x, y };
    const { frameW, frameH } = sizeRef.current;
    // Size measured once per content change (reading it here would force a layout on every move).
    const { w, h } = tipSizeRef.current;
    // With the magnifier on, keep the bubble outside the lens.
    const offset = settingsRef.current.magnifier ? LOUPE_SIZE / 2 + 8 : 14;
    let left = x + offset;
    let top = y + (settingsRef.current.magnifier ? 8 - LOUPE_SIZE / 2 : 18);
    if (left + w > frameW - 4) left = Math.max(4, x - w - offset + 4);
    if (top + h > frameH - 4) top = Math.max(4, y - h - 10);
    top = Math.max(4, top);
    tipEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }, []);

  const hoverAt = useCallback(
    (x: number, y: number) => {
      const at = blockAt(x, y);
      if (!at) {
        clearHover();
        return;
      }
      const m = modelRef.current;
      showCoords(at);
      const hit = hitAt(m, at.bx, at.by)!;
      const rect = hit.kind === "free" ? null : areaRect(m, hit, at.bx, at.by);
      const key = rect ? `${hit.kind}:${rect.x},${rect.y}` : null;
      if (key !== hoverKeyRef.current) {
        hoverKeyRef.current = key;
        overlayRef.current.hover = rect;
        setTip(rect ? { hit } : null);
        if (viewportRef.current) viewportRef.current.dataset.over = hit.kind;
        requestDraw();
      }
      positionTip(x, y);
      if (settingsRef.current.magnifier) showLoupeAt(x, y, false);
    },
    [blockAt, clearHover, positionTip, requestDraw, showCoords, showLoupeAt],
  );

  useLayoutEffect(() => {
    const tipEl = tipRef.current;
    if (!tipEl || !tip) return;
    tipSizeRef.current = { w: tipEl.offsetWidth, h: tipEl.offsetHeight };
    positionTip(tipPointRef.current.x, tipPointRef.current.y);
  }, [tip, positionTip]);

  // ------------------------------------------------- pointer, wheel, touch

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    type Point = { x: number; y: number };
    const pointers = new Map<number, Point & { type: string }>();
    let gesture:
      | { kind: "press" | "pan" | "loupe"; start: Point; view: View; moved: boolean; type: string }
      | { kind: "pinch"; dist: number; mid: Point; view: View }
      | null = null;
    let lastTap: { time: number; x: number; y: number } | null = null;
    let tapTimer = 0;
    // Mouse hover is handled at most once per frame.
    let hoverPoint: Point | null = null;
    let hoverFrame = 0;
    const flushHover = () => {
      hoverFrame = 0;
      if (hoverPoint && pointers.size === 0) hoverAt(hoverPoint.x, hoverPoint.y);
    };

    const local = (e: { clientX: number; clientY: number }): Point => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = local(e);
      pointers.set(e.pointerId, { ...p, type: e.pointerType });
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Pointer already gone.
      }
      cancelAnimation();
      if (keyboardRef.current) {
        // Mouse or touch takes over from the keyboard cursor.
        keyboardRef.current = false;
        overlayRef.current.cursor = null;
        requestDraw();
      }
      if (pointers.size === 1) {
        const loupe = settingsRef.current.magnifier && e.pointerType !== "mouse";
        gesture = { kind: loupe ? "loupe" : "press", start: p, view: viewRef.current, moved: false, type: e.pointerType };
        if (loupe) showLoupeAt(p.x, p.y, true);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gesture = { kind: "pinch", dist: Math.max(1, distance(a, b)), mid: middle(a, b), view: viewRef.current };
        window.clearTimeout(tapTimer);
        lastTap = null;
        hideLoupe();
        setTip(null);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = local(e);
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === "mouse") {
          hoverPoint = p;
          if (!hoverFrame) hoverFrame = requestAnimationFrame(flushHover);
        }
        return;
      }
      pointers.set(e.pointerId, { ...p, type: e.pointerType });
      if (!gesture) return;

      if (gesture.kind === "pinch") {
        if (pointers.size < 2) return;
        const [a, b] = [...pointers.values()];
        const d = dims();
        const zoom = clampZoom((gesture.view.zoom * distance(a, b)) / gesture.dist);
        const { wx, wy } = toWall(gesture.view, d, gesture.mid.x, gesture.mid.y);
        const m = middle(a, b);
        const s = fitOf(d) * zoom;
        setView({ zoom, ox: wx - m.x / s, oy: wy - m.y / s });
        return;
      }
      if (gesture.kind === "loupe") {
        gesture.moved = gesture.moved || distance(p, gesture.start) > 8;
        showLoupeAt(p.x, p.y, true);
        return;
      }
      const dx = p.x - gesture.start.x;
      const dy = p.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) > (gesture.type === "mouse" ? 4 : 8)) {
        gesture.moved = true;
        gesture.kind = "pan";
        el.classList.add("is-dragging");
        setTip(null);
        overlayRef.current.hover = null;
        hoverKeyRef.current = null;
      }
      if (gesture.kind === "pan") setView(panBy(gesture.view, dims(), dx, dy));
    };

    const endPointer = (e: PointerEvent, cancelled: boolean) => {
      const p = local(e);
      const ended = gesture;
      pointers.delete(e.pointerId);
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore.
      }
      if (pointers.size === 1 && ended?.kind === "pinch") {
        // Keep panning with the finger that is still down.
        const [rest] = [...pointers.values()];
        gesture = { kind: "pan", start: { x: rest.x, y: rest.y }, view: viewRef.current, moved: true, type: rest.type };
        commitZoomUi();
        return;
      }
      if (pointers.size > 0) return;
      gesture = null;
      el.classList.remove("is-dragging");
      commitZoomUi();
      if (!ended || cancelled) {
        if (ended?.kind === "loupe") hideLoupe();
        return;
      }
      if (ended.kind === "loupe") {
        hideLoupe();
        if (ended.moved) return;
      }
      if (ended.kind === "pinch" || (ended.kind !== "loupe" && ended.moved)) return;

      if (e.pointerType === "mouse") {
        handleTap(p.x, p.y, "mouse");
        return;
      }
      // Touch: wait a moment to tell a single tap from a double tap.
      const now = performance.now();
      if (lastTap && now - lastTap.time < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
        window.clearTimeout(tapTimer);
        lastTap = null;
        toggleZoomAt(p.x, p.y);
        return;
      }
      lastTap = { time: now, ...p };
      tapTimer = window.setTimeout(() => {
        lastTap = null;
        handleTap(p.x, p.y, e.pointerType);
      }, 260);
    };

    const onPointerUp = (e: PointerEvent) => endPointer(e, false);
    const onPointerCancel = (e: PointerEvent) => endPointer(e, true);
    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || pointers.size > 0) return;
      cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      hoverPoint = null;
      clearHover();
    };
    const onDblClick = (e: MouseEvent) => {
      const p = local(e);
      toggleZoomAt(p.x, p.y);
    };

    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      const zoomingIn = e.deltaY < 0;
      if (!e.ctrlKey) {
        // At the limits the wheel scrolls the page, so the wall never traps it.
        if (!zoomingIn && v.zoom <= MIN_ZOOM + 0.001) return;
        if (zoomingIn && v.zoom >= MAX_ZOOM - 0.001) return;
        if (zoomingIn && v.zoom <= MIN_ZOOM + 0.001 && el.getBoundingClientRect().top < -1) return;
      }
      e.preventDefault();
      cancelAnimation();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const delta = Math.max(-300, Math.min(300, e.deltaY * unit));
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0025));
      const p = local(e);
      setView(zoomAt(v, dims(), clampZoom(v.zoom * factor), p.x, p.y));
      if (settingsRef.current.magnifier) showLoupeAt(p.x, p.y, false);
    };

    // iOS Safari: stop the page itself from zooming while pinching the wall.
    const onGesture = (e: Event) => e.preventDefault();

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("dblclick", onDblClick);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGesture);
    el.addEventListener("gesturechange", onGesture);
    return () => {
      window.clearTimeout(tapTimer);
      cancelAnimationFrame(hoverFrame);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("dblclick", onDblClick);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGesture);
      el.removeEventListener("gesturechange", onGesture);
    };
  }, [cancelAnimation, clearHover, commitZoomUi, dims, handleTap, hideLoupe, hoverAt, requestDraw, setView, showLoupeAt, toggleZoomAt]);

  // ------------------------------------------------------------- keyboard

  const announceCenter = useCallback(() => {
    const cursor = overlayRef.current.cursor;
    if (!cursor) return;
    const m = modelRef.current;
    const hit = hitAt(m, cursor.bx, cursor.by);
    if (!hit) return;
    const tt = tRef.current;
    const where = tt("coords", { bx: cursor.bx, by: cursor.by, px: cursor.bx * m.block, py: cursor.by * m.block });
    if (hit.kind === "rental") {
      const r = m.rentals[hit.index];
      setAnnouncement(`${where}: ${r[5]}${r[6] ? `, ${r[6]}` : ""}${r[7] ? `, ${r[7]}` : ""}`);
    } else {
      setAnnouncement(`${where}: ${hit.kind === "free" ? "—" : hit.kind === "taken" ? tt("rentedPending") : tt("reserved")}`);
    }
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!keyboardRef.current) {
      // First key press: show the keyboard cursor in the middle of the view.
      keyboardRef.current = true;
      updateKeyboardCursor();
      requestDraw();
    }
    const d = dims();
    const step = Math.min(d.frameW, d.frameH) * 0.15;
    const key = e.key === "Add" || e.code === "NumpadAdd" ? "+" : e.key === "Subtract" || e.code === "NumpadSubtract" ? "-" : e.key;
    let handled = true;
    switch (key) {
      case "ArrowLeft":
        animateTo(panBy(viewRef.current, d, step, 0), 120, announceCenter);
        break;
      case "ArrowRight":
        animateTo(panBy(viewRef.current, d, -step, 0), 120, announceCenter);
        break;
      case "ArrowUp":
        animateTo(panBy(viewRef.current, d, 0, step), 120, announceCenter);
        break;
      case "ArrowDown":
        animateTo(panBy(viewRef.current, d, 0, -step), 120, announceCenter);
        break;
      case "+":
      case "=":
        zoomToLevel(stepZoom(viewRef.current.zoom, 1));
        break;
      case "-":
      case "_":
        zoomToLevel(stepZoom(viewRef.current.zoom, -1));
        break;
      case "0":
        animateTo({ zoom: 1, ox: 0, oy: 0 });
        break;
      case "Enter":
      case " ": {
        updateKeyboardCursor();
        const cursor = overlayRef.current.cursor;
        if (cursor) openPopup(hitAt(modelRef.current, cursor.bx, cursor.by)!, cursor.bx, cursor.by, true);
        break;
      }
      case "Escape":
        closePopup();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    keyboardRef.current = e.currentTarget.matches(":focus-visible");
    updateKeyboardCursor();
    requestDraw();
    if (keyboardRef.current) announceCenter();
  };
  const onBlur = () => {
    keyboardRef.current = false;
    overlayRef.current.cursor = null;
    requestDraw();
  };

  // Escape closes windows and search results from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setResults(null);
      if (popupRef.current) {
        const hadFocus = popupRef.current.contains(document.activeElement);
        closePopup();
        if (hadFocus) viewportRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closePopup]);

  // ---------------------------------------------- initial position from URL

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("x") || !params.has("y")) return;
    const m = modelRef.current;
    const bx = Number(params.get("x"));
    const by = Number(params.get("y"));
    if (!Number.isInteger(bx) || !Number.isInteger(by) || bx < 0 || by < 0 || bx >= m.cols || by >= m.rows) return;
    const z = Number(params.get("zoom") ?? 4);
    const zoom = clampZoom(Number.isFinite(z) && z > 0 ? z : 4);
    const hit = hitAt(m, bx, by)!;
    const rect = areaRect(m, hit, bx, by);
    const d = dims();
    const target = centerOn(d, (rect.x + rect.w / 2) * m.block, (rect.y + rect.h / 2) * m.block, zoom);
    setView(target);
    commitZoomUi();
    openPopup(hit, bx, by);
  }, [commitZoomUi, dims, openPopup, setView]);

  // ------------------------------------------------------ popup placement

  useLayoutEffect(() => {
    const box = popupRef.current;
    if (!popup || !box) return;
    // The window's size is read here and when its content changes, never per frame.
    const measure = () => {
      popupSizeRef.current = { w: box.offsetWidth, h: box.offsetHeight };
      placePopup();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [popup, sheet, placePopup]);

  // ---------------------------------------------------------------- search

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    const found = searchRentals(modelRef.current, q, 30);
    setSearchedFor(q);
    if (found.length === 1) focusRental(found[0]);
    else setResults(found);
  };

  // ---------------------------------------------------------------- render

  const image = snapshot.image;
  const ready = imageReady || !imageUrl;
  const tipContent = (() => {
    if (!tip) return null;
    if (tip.hit.kind === "rental") {
      const r = model.rentals[tip.hit.index];
      if (!r) return null;
      return (
        <>
          <strong>{r[5]}</strong>
          {r[6] && <span>{r[6]}</span>}
          {r[7] && <span className="wall-tip-domain">{r[7]}</span>}
        </>
      );
    }
    return <span>{tip.hit.kind === "taken" ? t("rentedPending") : t("reserved")}</span>;
  })();

  const zoomPercent = (z: number) => format.number(z, { style: "percent" });

  return (
    <section className="wall" aria-label={t("regionLabel")}>
      <div className="wall-frame" ref={frameRef} style={{ maxWidth: model.width }}>
        <div
          ref={viewportRef}
          className={`wall-viewport${ready ? " is-ready" : ""}${magnifier ? " is-magnifier" : ""}`}
          style={{
            aspectRatio: `${model.width} / ${model.height}`,
            touchAction: zoomUi > 1.01 || magnifier ? "none" : "pan-y",
          }}
          tabIndex={0}
          role="application"
          aria-label={t("regionLabel")}
          aria-describedby="wall-help"
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          {image && (
            <picture>
              <source srcSet={image.webp} type="image/webp" />
              <img
                className="wall-img"
                src={image.png}
                width={model.width}
                height={model.height}
                useMap="#wall-map"
                alt={t("imageAlt", { pixels: model.width * model.height })}
                fetchPriority="high"
                decoding="async"
                draggable={false}
              />
            </picture>
          )}
          <canvas ref={canvasRef} className="wall-canvas" aria-hidden="true" />
          <div ref={tipRef} className="wall-tip" hidden={!tipContent} aria-hidden="true">
            {tipContent}
          </div>
          <div ref={loupeRef} className="wall-loupe" hidden={!loupeVisible} aria-hidden="true">
            <canvas ref={loupeCanvasRef} />
          </div>
        </div>
        {popup && (
          <WallPopup
            key={`${popup.hit.kind}:${popup.bx}:${popup.by}`}
            ref={popupRef}
            popup={popup}
            model={model}
            locale={locale}
            blockPriceCents={blockPriceCents}
            currency={currency}
            sheet={sheet}
            getImage={() => imageRef.current}
            shareUrl={shareUrl}
            onClose={() => {
              const hadFocus = popupRef.current?.contains(document.activeElement);
              closePopup();
              if (hadFocus) viewportRef.current?.focus();
            }}
          />
        )}
      </div>
      {/* Outside the viewport on purpose: hover updates there must not restyle thousands of areas. */}
      <map name="wall-map" id="wall-map" dangerouslySetInnerHTML={{ __html: mapHtml }} />
      <p id="wall-help" className="visually-hidden">
        {t("keyboardHelp")}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      <noscript>
        <p className="wall-noscript">{t("noscript")}</p>
      </noscript>

      <div className="wall-toolbar">
        <div className="tb-group tb-zoom" role="group" aria-label={t("zoom")}>
          <span className="tb-label">{t("zoom")}:</span>
          <button type="button" className="btn btn-icon" onClick={() => zoomToLevel(stepZoom(viewRef.current.zoom, -1))} aria-label={t("zoomOut")} disabled={zoomUi <= MIN_ZOOM + 0.01}>
            −
          </button>
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              type="button"
              className="btn"
              aria-pressed={Math.abs(zoomUi - z) < 0.05}
              aria-label={t("zoomTo", { percent: zoomPercent(z) })}
              onClick={() => zoomToLevel(z)}
            >
              {zoomPercent(z)}
            </button>
          ))}
          <button type="button" className="btn btn-icon" onClick={() => zoomToLevel(stepZoom(viewRef.current.zoom, 1))} aria-label={t("zoomIn")} disabled={zoomUi >= MAX_ZOOM - 0.01}>
            +
          </button>
        </div>
        <div className="tb-group">
          <button type="button" className="btn" aria-pressed={magnifier} onClick={toggleMagnifier}>
            {t("magnifier")}
          </button>
          <button type="button" className="btn" onClick={randomSpot} disabled={model.rentals.length === 0}>
            {t("random")}
          </button>
          <label className="tb-check">
            <input type="checkbox" checked={showFree} onChange={(e) => toggleShowFree(e.target.checked)} /> {t("showFree")}
          </label>
        </div>
        <span className="tb-coords" ref={coordsRef} aria-hidden="true" data-idle="1">
          {t("coordsIdle")}
        </span>
        <form className="tb-search" role="search" onSubmit={onSearch}>
          <label className="visually-hidden" htmlFor="wall-search">
            {t("searchLabel")}
          </label>
          <input
            id="wall-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setResults(null);
            }}
            placeholder={t("searchPlaceholder")}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="search"
          />
          <button type="submit" className="btn">
            {t("search")}
          </button>
          {results && (
            <div className="tb-results" role="status">
              {results.length === 0 ? (
                <p>{t("searchNone", { query: searchedFor })}</p>
              ) : (
                <>
                  <p>{t("searchMany", { count: results.length })}</p>
                  <ul>
                    {results.map((i) => {
                      const r = model.rentals[i];
                      return (
                        <li key={r[0]}>
                          <button type="button" className="link-button" onClick={() => focusRental(i)}>
                            {r[5]}
                          </button>
                          {r[6] && <span> — {r[6]}</span>}
                          {r[7] && <span className="tb-results-domain"> ({r[7]})</span>}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </form>
        <a className="btn btn-rent tb-rent" href={localePath(locale, "/rent")}>
          {t("rent")}
        </a>
      </div>
    </section>
  );
}
