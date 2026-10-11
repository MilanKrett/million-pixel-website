"use client";

import { useTranslations } from "use-intl/react";

/** A content image at its real size and enlarged 8× (sharp pixels), shown side by side. */
export function Preview({ src, width, height, children }: { src: string; width: number; height: number; children?: React.ReactNode }) {
  const t = useTranslations("rent");
  // 8×, but never wider than the column.
  const scale = Math.max(1, Math.min(8, Math.floor(480 / width)));
  return (
    <div className="preview">
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- exact pixels, no optimisation wanted */}
        <img src={src} width={width} height={height} alt="" className="preview-actual" />
        <figcaption>{t("previewActual")}</figcaption>
      </figure>
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- exact pixels, no optimisation wanted */}
        <img src={src} width={width * scale} height={height * scale} alt="" className="preview-zoom" />
        <figcaption>{t("previewZoom", { scale })}</figcaption>
      </figure>
      {children}
    </div>
  );
}
