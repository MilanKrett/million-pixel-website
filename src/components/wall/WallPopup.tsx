"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { useFormatter, useLocale, useTranslations } from "use-intl/react";
import { localePath, type Locale } from "@/i18n/config";
import { pixelRange } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { areaRect, rentalRect, type Hit, type WallModel } from "./model";

export interface PopupState {
  hit: Hit;
  bx: number;
  by: number;
  /** Opened from the keyboard: focus moves into the window. */
  viaKeyboard: boolean;
  /** Public number of the rental, to find it again after the data refreshes. */
  no: number | null;
}

interface Props {
  popup: PopupState;
  model: WallModel;
  locale: Locale;
  blockPriceCents: number;
  currency: string;
  sheet: boolean;
  getImage: () => CanvasImageSource | null;
  shareUrl: (index: number) => string;
  onClose: () => void;
  ref?: Ref<HTMLDivElement>;
}

const PREVIEW_MAX = 168;

/** Small window shown after clicking a spot on the wall. */
export function WallPopup({
  popup,
  model,
  locale,
  blockPriceCents,
  currency,
  sheet,
  getImage,
  shareUrl,
  onClose,
  ref,
}: Props) {
  const t = useTranslations("popup");
  const tw = useTranslations("wall");
  const tc = useTranslations("common");
  const format = useFormatter();
  const intlLocale = useLocale();
  const [shareState, setShareState] = useState<"idle" | "copied" | { manual: string }>("idle");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (popup.viaKeyboard) closeRef.current?.focus();
  }, [popup]);

  const rect = areaRect(model, popup.hit, popup.bx, popup.by);
  const range = pixelRange(rect, model.block);
  const position_ = tw("position", { x0: range.x0, x1: range.x1, y0: range.y0, y1: range.y1 });
  const size = tw("size", { w: rect.w * model.block, h: rect.h * model.block });

  let title: string;
  let body: React.ReactNode;

  if (popup.hit.kind === "rental") {
    const index = popup.hit.index;
    const [no, , , , , rentalTitle, name, domain, since] = model.rentals[index];
    title = rentalTitle;

    const share = async () => {
      const url = shareUrl(index);
      try {
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
          await navigator.share({ url, title: rentalTitle });
          return;
        }
        await navigator.clipboard.writeText(url);
        setShareState("copied");
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
        setShareState({ manual: url });
      }
    };

    body = (
      <>
        <div className="wall-popup-main">
          <RentalPreview getImage={getImage} model={model} index={index} />
          <div className="wall-popup-info">
            {name && <div>{t("by", { name })}</div>}
            {domain && <div className="wall-popup-domain">{domain}</div>}
            <div className="wall-popup-meta">
              {position_} · {size}
            </div>
            {since && (
              <div className="wall-popup-meta">
                {t("since", { date: format.dateTime(new Date(`${since}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) })}
              </div>
            )}
          </div>
        </div>
        {!domain && <p className="wall-popup-note">{t("noLink")}</p>}
        <div className="wall-popup-actions">
          {domain && (
            <a className="btn" href={`/go/${no}`} target="_blank" rel="nofollow sponsored ugc noopener noreferrer">
              {t("open")}
            </a>
          )}
          <button type="button" className="btn" onClick={share}>
            {t("share")}
          </button>
          <a className="btn" href={localePath(locale, `/report?rental=${no}`)}>
            {t("report")}
          </a>
        </div>
        {shareState === "copied" && (
          <p className="wall-popup-note" role="status">
            {t("copied")}
          </p>
        )}
        {typeof shareState === "object" && (
          <p className="wall-popup-note">
            {t("copyFailed")}{" "}
            <input className="wall-popup-copy" readOnly value={shareState.manual} onFocus={(e) => e.currentTarget.select()} />
          </p>
        )}
      </>
    );
  } else if (popup.hit.kind === "free") {
    title = t("freeTitle");
    const rentHref = localePath(locale, `/buy?x=${popup.bx}&y=${popup.by}&w=1&h=1`);
    body = (
      <>
        <p className="wall-popup-text">
          {t("freeText", {
            bx: popup.bx,
            by: popup.by,
            position: position_,
            price: formatMoney(blockPriceCents, currency, intlLocale),
          })}
        </p>
        <div className="wall-popup-actions">
          <a className="btn btn-rent" href={rentHref}>
            {t("rentThis")}
          </a>
        </div>
      </>
    );
  } else {
    const taken = popup.hit.kind === "taken";
    title = taken ? t("takenTitle") : t("holdTitle");
    body = (
      <>
        <p className="wall-popup-text">{taken ? t("takenText") : t("holdText")}</p>
        <p className="wall-popup-meta">
          {position_} · {size}
        </p>
      </>
    );
  }

  return (
    <div
      ref={ref}
      className={`wall-popup${sheet ? " is-sheet" : ""}`}
      role="dialog"
      aria-label={t("label")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="wall-popup-head">
        <strong className="wall-popup-title">{title}</strong>
        <button ref={closeRef} type="button" className="wall-popup-close" onClick={onClose} aria-label={tc("close")}>
          ×
        </button>
      </div>
      <div className="wall-popup-body">{body}</div>
    </div>
  );
}

/** The rental cut out of the wall image, enlarged 4× (or shrunk to fit the window). */
function RentalPreview({ getImage, model, index }: { getImage: () => CanvasImageSource | null; model: WallModel; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rect = rentalRect(model.rentals[index]);
  const wPx = rect.w * model.block;
  const hPx = rect.h * model.block;
  const scale = Math.min(4, PREVIEW_MAX / Math.max(wPx, hPx));
  const cssW = Math.max(1, Math.round(wPx * scale));
  const cssH = Math.max(1, Math.round(hPx * scale));

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = getImage();
    if (!canvas || !image) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, rect.x * model.block, rect.y * model.block, wPx, hPx, 0, 0, canvas.width, canvas.height);
  });

  return <canvas ref={canvasRef} className="wall-popup-preview" style={{ width: cssW, height: cssH }} aria-hidden="true" />;
}
