"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { PixelEditor } from "./PixelEditor";
import { Preview } from "./Preview";
import type { OrderResponse, RentConfig } from "./shared";
import { TextEditor } from "./TextEditor";
import { UploadEditor } from "./UploadEditor";

type Tab = "upload" | "draw" | "text";

/** Step 3: the picture for the rented area — upload, draw or colour + text. */
export function ContentStep({
  order,
  config,
  onSaved,
  onNext,
}: {
  order: OrderResponse;
  config: RentConfig;
  onSaved: (order: OrderResponse) => void;
  onNext: () => void;
}) {
  const t = useTranslations("rent");
  const width = order.rect.w * config.block_size_px;
  const height = order.rect.h * config.block_size_px;
  const initialTab = (order.content?.kind as Tab | undefined) ?? "upload";
  const [tab, setTab] = useState<Tab>(["upload", "draw", "text"].includes(initialTab) ? initialTab : "upload");
  const tabs: Tab[] = ["upload", "draw", "text"];

  return (
    <div className="rent-content">
      <h2>{t("contentTitle", { w: width, h: height })}</h2>

      {order.content && order.previewUrl && (
        <div className="rent-current">
          <h3>{t("currentContent")}</h3>
          <Preview src={`${order.previewUrl}?v=${order.content.id}`} width={width} height={height} />
          <p>
            <button type="button" className="btn btn-rent" onClick={onNext}>
              {t("continue")}
            </button>{" "}
            <span className="muted">{t("orReplace")}</span>
          </p>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label={t("contentKinds")}>
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            className="tab"
            onClick={() => setTab(k)}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "upload" && <UploadEditor order={order} config={config} width={width} height={height} onSaved={onSaved} />}
        {tab === "draw" && <PixelEditor order={order} width={width} height={height} onSaved={onSaved} />}
        {tab === "text" && <TextEditor order={order} width={width} height={height} onSaved={onSaved} />}
      </div>
    </div>
  );
}
