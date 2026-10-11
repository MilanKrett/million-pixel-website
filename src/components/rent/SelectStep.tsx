"use client";

import { useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "use-intl/react";
import { Wall, type SelectOptions } from "@/components/wall/Wall";
import { pixelRange, type Rect } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { quote } from "@/lib/pricing";
import type { WallSnapshot } from "@/lib/wall/snapshot";
import { api, sameRect, type RentConfig } from "./shared";

export type ReserveResult = { ok: true } | { ok: false; error: string; suggestions?: Rect[] };

interface Props {
  snapshot: WallSnapshot;
  config: RentConfig;
  selection: Rect | null;
  onSelection: (rect: Rect | null) => void;
  onReserve: (rect: Rect) => Promise<ReserveResult>;
  /** The current reservation while choosing a new place ("Change place"). */
  own?: Rect | null;
  /** Go back to the order keeping the current place. */
  onKeep?: () => void;
}

type Spots = { nearest: Rect[]; random: Rect[] };

/** Step 1: choose a rectangle of whole blocks on the wall. */
export function SelectStep({ snapshot, config, selection, onSelection, onReserve, own = null, onKeep }: Props) {
  const t = useTranslations("rent");
  const format = useFormatter();
  const intlLocale = useLocale();
  const block = config.block_size_px;
  const [conflicts, setConflicts] = useState(0);
  const [focus, setFocus] = useState<Rect | null>(selection);
  const [spots, setSpots] = useState<Spots | null>(null);
  const [spotsBusy, setSpotsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findSize, setFindSize] = useState({ w: selection ? selection.w * block : 50, h: selection ? selection.h * block : 50 });

  const suggestions = useMemo(() => (spots ? [...spots.nearest, ...spots.random] : []), [spots]);
  const select = useMemo<SelectOptions>(
    () => ({
      rect: selection,
      onChange: (r) => {
        onSelection(r);
        setError(null);
      },
      suggestions,
      focus,
      onConflictsChange: setConflicts,
      own,
    }),
    [selection, onSelection, suggestions, focus, own],
  );
  const keeping = own !== null && onKeep !== undefined && sameRect(selection, own);

  const money = (cents: number) => formatMoney(cents, config.currency, intlLocale);
  const blocks = selection ? selection.w * selection.h : 0;
  const tooSmall = selection !== null && blocks < config.minBlocks;
  const tooLarge = selection !== null && config.maxBlocks !== null && blocks > config.maxBlocks;
  const canContinue = selection !== null && conflicts === 0 && !tooSmall && !tooLarge && !busy && !config.salesPaused;

  const choose = (r: Rect) => {
    onSelection(r);
    setFocus(r);
    setError(null);
  };

  const applyManual = (form: FormData) => {
    const toBlocks = (name: string, min: number) => Math.max(min, Math.round(Number(form.get(name)) / block));
    const w = Math.min(config.cols, toBlocks("w", 1));
    const h = Math.min(config.rows, toBlocks("h", 1));
    const x = Math.min(config.cols - w, Math.floor(Math.max(0, Number(form.get("x"))) / block));
    const y = Math.min(config.rows - h, Math.floor(Math.max(0, Number(form.get("y"))) / block));
    if ([x, y, w, h].every(Number.isFinite)) choose({ x, y, w, h });
  };

  const findSpots = async () => {
    const w = Math.max(1, Math.min(config.cols, Math.round(findSize.w / block)));
    const h = Math.max(1, Math.min(config.rows, Math.round(findSize.h / block)));
    setSpotsBusy(true);
    try {
      setSpots(await api<Spots>(`/api/find-space?w=${w}&h=${h}`));
    } catch {
      setSpots({ nearest: [], random: [] });
    } finally {
      setSpotsBusy(false);
    }
  };

  const reserve = async () => {
    if (!selection || !canContinue) return;
    setBusy(true);
    setError(null);
    const result = await onReserve(selection);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      if (result.suggestions) setSpots({ nearest: result.suggestions, random: [] });
    }
  };

  const describe = (r: Rect) => {
    const p = pixelRange(r, block);
    return t("spot", { x: p.x0, y: p.y0, w: r.w * block, h: r.h * block });
  };

  const range = selection ? pixelRange(selection, block) : null;

  return (
    <div className="rent-select">
      <p className="rent-help">{t("selectHelp")}</p>
      <p className="rent-help rent-help-touch">{t("selectHelpTouch")}</p>

      <Wall
        initial={snapshot}
        blockPriceCents={Math.round(block * block * config.price_cents_per_pixel_year)}
        currency={config.currency}
        directLinkOpen={false}
        select={select}
      />

      <div className="rent-panel">
        <div className="rent-panel-main">
          <h2>{t("yourSelection")}</h2>
          {!selection ? (
            <p>{t("noSelection")}</p>
          ) : (
            <>
              <table className="data">
                <tbody>
                  <tr>
                    <th scope="row">{t("size")}</th>
                    <td>
                      {t("sizeValue", { w: selection.w * block, h: selection.h * block, bw: selection.w, bh: selection.h })}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("pixels")}</th>
                    <td>{format.number(blocks * block * block)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t("positionLabel")}</th>
                    <td>{t("position", { x0: range!.x0, x1: range!.x1, y0: range!.y0, y1: range!.y1 })}</td>
                  </tr>
                  <tr>
                    <th scope="row">{t("price")}</th>
                    <td>
                      {config.periods.map((p) => {
                        const q = quote(config, selection.w, selection.h, p.years)!;
                        return (
                          <div key={p.years}>
                            {t("pricePeriod", { years: p.years, price: money(q.totalCents) })}
                            {q.discountPct > 0 && <span className="muted"> {t("discount", { pct: q.discountPct })}</span>}
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                </tbody>
              </table>
              {conflicts > 0 && (
                <p className="error" role="alert">
                  {t("conflicts", { count: conflicts })}
                </p>
              )}
              {tooSmall && <p className="error">{t("tooSmall", { min: config.minBlocks })}</p>}
              {tooLarge && <p className="error">{t("tooLarge", { max: config.maxBlocks ?? 0 })}</p>}
            </>
          )}

          {error && (
            <p className="error" role="alert">
              {t.has(`reserveErrors.${error}`) ? t(`reserveErrors.${error}` as "reserveErrors.error") : t("reserveErrors.error")}
            </p>
          )}

          <p>
            {keeping ? (
              <button type="button" className="btn btn-rent" onClick={onKeep}>
                {t("keepPlace")}
              </button>
            ) : (
              <button type="button" className="btn btn-rent" disabled={!canContinue} onClick={reserve}>
                {busy ? t("reserving") : t("continue")}
              </button>
            )}
          </p>
          <p className="muted small">{t("holdNote", { minutes: config.holdMinutes })}</p>
        </div>

        <div className="rent-panel-side">
          <form
            className="rent-manual"
            key={selection ? `${selection.x},${selection.y},${selection.w},${selection.h}` : "none"}
            onSubmit={(e) => {
              e.preventDefault();
              applyManual(new FormData(e.currentTarget));
            }}
          >
            <h3>{t("manualTitle")}</h3>
            <div className="field-row">
              {(
                [
                  ["x", selection ? selection.x * block : 0],
                  ["y", selection ? selection.y * block : 0],
                  ["w", selection ? selection.w * block : block],
                  ["h", selection ? selection.h * block : block],
                ] as const
              ).map(([name, value]) => (
                <label key={name}>
                  {t(`manual.${name}`)}
                  <input name={name} type="number" inputMode="numeric" min={name === "w" || name === "h" ? block : 0} step={block} defaultValue={value} />
                </label>
              ))}
            </div>
            <button type="submit" className="btn">
              {t("apply")}
            </button>
          </form>

          <div className="rent-find">
            <h3>{t("findTitle")}</h3>
            <div className="field-row">
              <label>
                {t("manual.w")}
                <input type="number" inputMode="numeric" min={block} step={block} value={findSize.w} onChange={(e) => setFindSize({ ...findSize, w: Number(e.target.value) })} />
              </label>
              <label>
                {t("manual.h")}
                <input type="number" inputMode="numeric" min={block} step={block} value={findSize.h} onChange={(e) => setFindSize({ ...findSize, h: Number(e.target.value) })} />
              </label>
              <button type="button" className="btn" onClick={findSpots} disabled={spotsBusy}>
                {t("find")}
              </button>
            </div>
            {spots && (
              <div className="rent-spots">
                {spots.nearest.length + spots.random.length === 0 ? (
                  <p>{t("noSpots")}</p>
                ) : (
                  <>
                    {spots.nearest.length > 0 && <p>{t("spotsNear")}</p>}
                    <ul>
                      {spots.nearest.map((r) => (
                        <li key={`n${r.x},${r.y}`}>
                          <button type="button" className="link-button" onClick={() => choose(r)} aria-pressed={sameRect(r, selection)}>
                            {describe(r)}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {spots.random.length > 0 && <p>{t("spotsRandom")}</p>}
                    <ul>
                      {spots.random.map((r) => (
                        <li key={`r${r.x},${r.y}`}>
                          <button type="button" className="link-button" onClick={() => choose(r)} aria-pressed={sameRect(r, selection)}>
                            {describe(r)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
