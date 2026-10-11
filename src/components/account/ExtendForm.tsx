"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import { intlLocale, localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import { formatMoney } from "@/lib/money";

export interface ExtendOption {
  years: number;
  discountPct: number;
  totalCents: number;
  /** ISO date of the new end. */
  endsAt: string;
}

/** Choose the extension, confirm the consents and go to the payment. */
export function ExtendForm({ no, extKey, options, currency }: { no: number; extKey: string | null; options: ExtendOption[]; currency: string }) {
  const t = useTranslations("extend");
  const format = useFormatter();
  const locale = useAppLocale();
  const [years, setYears] = useState<number | null>(options[0]?.years ?? null);
  const [terms, setTerms] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = options.find((o) => o.years === years) ?? null;
  const money = (cents: number) => formatMoney(cents, currency, intlLocale(locale));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selected) return setError("invalid_period");
    if (!terms || !waiver) return setError("consent_required");
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>("/api/extend", {
        method: "POST",
        body: JSON.stringify({ no, key: extKey, years: selected.years, terms, waiver, locale }),
      });
      // The payment page (Stripe, or the test page on this site).
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "error");
      setBusy(false);
    }
  };

  return (
    <form className="extend-form" onSubmit={submit}>
      <fieldset className="field">
        <legend>
          <b>{t("choose")}</b>
        </legend>
        {options.map((o) => (
          <label key={o.years} className="check-line">
            <input type="radio" name="years" value={o.years} checked={years === o.years} onChange={() => setYears(o.years)} />{" "}
            <b>{t("option", { years: o.years })}</b> — {money(o.totalCents)}
            {o.discountPct > 0 && <span className="muted"> ({t("discount", { discount: o.discountPct })})</span>}
            <span className="muted small"> · {t("newEnd", { date: format.dateTime(new Date(o.endsAt), { dateStyle: "long" }) })}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="field">
        <label className="check-line">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />{" "}
          {t.rich("terms", {
            terms: (chunks) => (
              <a href={localePath(locale, "/terms")} target="_blank" rel="noopener">
                {chunks}
              </a>
            ),
            rules: (chunks) => (
              <a href={localePath(locale, "/content-rules")} target="_blank" rel="noopener">
                {chunks}
              </a>
            ),
          })}
        </label>
        <label className="check-line">
          <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} /> {t("waiver")}
        </label>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      <p>
        <button type="submit" className="btn btn-rent btn-big" disabled={busy || !selected}>
          {busy ? t("redirecting") : t("pay", { amount: selected ? money(selected.totalCents) : "—" })}
        </button>
      </p>
    </form>
  );
}
