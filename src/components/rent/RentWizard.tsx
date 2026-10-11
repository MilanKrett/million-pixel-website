"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "use-intl/react";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import { pixelRange, type Rect } from "@/lib/geometry";
import type { WallSnapshot } from "@/lib/wall/snapshot";
import { ContentStep } from "./ContentStep";
import { Countdown } from "./Countdown";
import { DetailsStep } from "./DetailsStep";
import { SelectStep, type ReserveResult } from "./SelectStep";
import { api, ApiError, nextStep, type CarriedTexts, type OrderResponse, type RentConfig, type Step } from "./shared";
import { SummaryStep } from "./SummaryStep";

const STEPS: Step[] = ["select", "content", "details", "summary"];

function rectFromQuery(params: URLSearchParams, config: RentConfig): Rect | null {
  const [x, y, w, h] = ["x", "y", "w", "h"].map((k) => Number(params.get(k)));
  const ok = [x, y, w, h].every(Number.isInteger) && x >= 0 && y >= 0 && w >= 1 && h >= 1 && x + w <= config.cols && y + h <= config.rows;
  return ok ? { x, y, w, h } : null;
}

/**
 * The order flow (spec section 6): choose the place → it is reserved →
 * content → details → summary → payment. Works without an account; the
 * order is tied to this browser by an httpOnly cookie.
 */
export function RentWizard({ initial, config }: { initial: WallSnapshot; config: RentConfig }) {
  const t = useTranslations("rent");
  const locale = useAppLocale();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [selection, setSelection] = useState<Rect | null>(null);
  const [notice, setNotice] = useState<"expired" | "expiredBefore" | "paid" | null>(null);
  const [wallKey, setWallKey] = useState(0);
  // Texts of a replaced order whose picture could not move along (other size).
  const [carried, setCarried] = useState<CarriedTexts | null>(null);

  const loadOrder = useCallback(async () => (await api<{ order: OrderResponse | null }>("/api/order")).order, []);

  // Continue an order started earlier in this browser, or start from ?x=&y=&w=&h=.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromUrl = rectFromQuery(new URLSearchParams(window.location.search), config);
      let current: OrderResponse | null = null;
      try {
        current = await loadOrder();
      } catch {
        current = null;
      }
      if (cancelled) return;
      if (current && (current.status === "hold" || current.status === "awaiting_payment")) {
        setOrder(current);
        setSelection(current.rect);
        setStep(nextStep(current));
      } else if (current && current.status === "in_review" && !fromUrl) {
        setNotice("paid");
      } else {
        if (current?.status === "expired") setNotice("expiredBefore");
        setSelection(fromUrl ?? (current?.status === "expired" ? current.rect : null));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [config, loadOrder]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  // A new reservation replaces the current order on the server, which carries
  // over the picture (same size only), e-mail and period.
  const reserve = useCallback(
    async (rect: Rect, turnstile?: string | null): Promise<ReserveResult> => {
      const texts = order?.content
        ? { title: order.content.title, url: order.content.url, displayName: order.content.displayName }
        : null;
      try {
        await api("/api/holds", { method: "POST", body: JSON.stringify({ ...rect, locale, turnstile }) });
        const fresh = await loadOrder();
        if (!fresh) return { ok: false, error: "error" };
        setCarried((c) => (fresh.content ? null : (texts ?? c)));
        setOrder(fresh);
        setNotice(null);
        setStep(nextStep(fresh));
        return { ok: true };
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            error: error.code,
            suggestions: Array.isArray(error.body.suggestions) ? (error.body.suggestions as Rect[]) : undefined,
          };
        }
        return { ok: false, error: "network" };
      }
    },
    [loadOrder, locale, order],
  );

  // The current place stays reserved until a new one is reserved.
  const changePlace = useCallback(() => {
    if (order) setSelection(order.rect);
    setStep("select");
    setWallKey((k) => k + 1);
  }, [order]);

  const keepPlace = useCallback(() => {
    if (!order) return;
    setSelection(order.rect);
    setStep(nextStep(order));
  }, [order]);

  const onExpired = useCallback(() => {
    setNotice("expired");
    setOrder((o) => (o ? { ...o, status: "expired" } : o));
  }, []);

  const saved = useCallback((fresh: OrderResponse, next?: Step) => {
    setOrder(fresh);
    if (next) setStep(next);
  }, []);

  if (loading) {
    return (
      <div className="rent">
        <h1>{t("title")}</h1>
        <p>{t("loading")}</p>
      </div>
    );
  }

  const active = order && order.status !== "expired" ? order : null;
  const range = active ? pixelRange(active.rect, config.block_size_px) : null;

  return (
    <div className="rent">
      <h1>{t("title")}</h1>
      <ol className="rent-steps" aria-label={t("stepsLabel")}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={STEPS.indexOf(step) > i ? "is-done" : undefined}>
            {i + 1}. {t(`steps.${s}`)}
          </li>
        ))}
        <li>5. {t("steps.payment")}</li>
      </ol>

      {config.salesPaused && <p className="notice">{t("salesPaused")}</p>}
      {notice === "paid" && (
        <div className="notice">
          <p>{t("alreadyPaid")}</p>
          <p>
            <a href={localePath(locale, "/buy/thanks")}>{t("seeStatus")}</a>
          </p>
        </div>
      )}
      {notice === "expiredBefore" && step === "select" && <p className="notice">{t("expiredBefore")}</p>}

      {order && step !== "select" && (
        <div className={`rent-hold${order.status === "expired" ? " is-expired" : ""}`} role="status">
          {order.status === "expired" ? (
            <>
              <b>{t("holdExpired")}</b>{" "}
              <button type="button" className="btn" onClick={() => reserve(order.rect)}>
                {t("reserveAgain")}
              </button>{" "}
              <button type="button" className="link-button" onClick={changePlace}>
                {t("changePlace")}
              </button>
              {order.content && (
                <>
                  <br />
                  <span className="small">{t("holdExpiredKept")}</span>
                </>
              )}
            </>
          ) : (
            <>
              {t.rich("holdInfo", {
                position: t("position", { x0: range!.x0, x1: range!.x1, y0: range!.y0, y1: range!.y1 }),
                b: (chunks) => <b>{chunks}</b>,
              })}{" "}
              <Countdown until={order.holdExpiresAt} onExpired={onExpired} />{" "}
              <button type="button" className="link-button" onClick={changePlace}>
                {t("changePlace")}
              </button>
            </>
          )}
        </div>
      )}

      {active && step === "select" && (
        <div className="rent-hold" role="status">
          {t.rich("changingPlace", {
            position: t("position", { x0: range!.x0, x1: range!.x1, y0: range!.y0, y1: range!.y1 }),
            b: (chunks) => <b>{chunks}</b>,
          })}{" "}
          <Countdown until={active.holdExpiresAt} onExpired={onExpired} />{" "}
          <button type="button" className="link-button" onClick={keepPlace}>
            {t("backToOrder")}
          </button>
          {active.content && (
            <>
              <br />
              <span className="small">{t("changingPlaceContent")}</span>
            </>
          )}
        </div>
      )}

      {step === "select" && (
        <SelectStep
          key={wallKey}
          snapshot={initial}
          config={config}
          selection={selection}
          onSelection={setSelection}
          onReserve={reserve}
          own={active?.rect ?? null}
          onKeep={active ? keepPlace : undefined}
        />
      )}
      {active && step === "content" && <ContentStep order={active} config={config} onSaved={saved} onNext={() => setStep("details")} />}
      {active && step === "details" && (
        <DetailsStep
          order={active}
          carried={carried}
          onSaved={(o) => saved(o, "summary")}
          onBack={() => setStep("content")}
        />
      )}
      {active && step === "summary" && (
        <SummaryStep order={active} config={config} wallImage={initial.image?.png ?? null} onEdit={setStep} />
      )}
    </div>
  );
}
