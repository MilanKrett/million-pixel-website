"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import { Wall, type SelectOptions } from "@/components/wall/Wall";
import { pixelRange, type Rect } from "@/lib/geometry";
import type { WallSnapshot } from "@/lib/wall/snapshot";

/** Choose blocks on the wall and reserve them without payment (own ads, charity, contests). */
export function ReservePlace({ snapshot, blockSize, currency, pricePerPixel }: { snapshot: WallSnapshot; blockSize: number; currency: string; pricePerPixel: number }) {
  const t = useTranslations("admin.reserve");
  const router = useRouter();
  const [rect, setRect] = useState<Rect | null>(null);
  const [conflicts, setConflicts] = useState(0);
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const select = useMemo<SelectOptions>(() => ({ rect, onChange: setRect, onConflictsChange: setConflicts }), [rect]);

  const reserve = async () => {
    if (!rect) return;
    setBusy(true);
    setError(null);
    try {
      const { no } = await api<{ no: number }>("/api/admin/reserve", { method: "POST", body: JSON.stringify({ ...rect, endsAt, note }) });
      router.push(`/admin/rentals/${no}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
      setBusy(false);
    }
  };

  const range = rect ? pixelRange(rect, blockSize) : null;
  return (
    <div className="admin-reserve">
      <Wall initial={snapshot} blockPriceCents={Math.round(blockSize * blockSize * pricePerPixel)} currency={currency} directLinkOpen={false} select={select} />
      <div className="rent-panel">
        {rect && range ? (
          <p>
            {t("selection", { x0: range.x0, x1: range.x1, y0: range.y0, y1: range.y1, w: rect.w * blockSize, h: rect.h * blockSize })}
            {conflicts > 0 && <span className="error"> {t("conflicts", { count: conflicts })}</span>}
          </p>
        ) : (
          <p className="muted">{t("noSelection")}</p>
        )}
        <div className="field-row">
          <label>
            {t("endsAt")}
            <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label>
            {t("note")}
            <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <p className="muted small">{t("endsAtHelp")}</p>
        {error && (
          <p className="error" role="alert">
            {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
          </p>
        )}
        <p>
          <button type="button" className="btn btn-rent" disabled={!rect || conflicts > 0 || busy} onClick={reserve}>
            {t("reserve")}
          </button>
        </p>
      </div>
    </div>
  );
}
