"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import { useAppLocale } from "@/i18n/provider";
import { REASON_CODES } from "@/lib/email/reasons";
import { Turnstile } from "./Turnstile";

const subscribe = () => () => {};
const rentalFromUrl = () => new URLSearchParams(window.location.search).get("rental")?.replace(/\D/g, "") ?? "";

/** The report form: which rental, what is wrong, an optional address for the answer. */
export function ReportForm({ siteKey }: { siteKey: string | null }) {
  const t = useTranslations("report");
  const tr = useTranslations("reasons");
  const locale = useAppLocale();
  const fromUrl = useSyncExternalStore(subscribe, rentalFromUrl, () => "");
  const [rentalNo, setRentalNo] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const number = rentalNo ?? fromUrl;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ reference: string }>("/api/reports", {
        method: "POST",
        body: JSON.stringify({ rentalNo: Number(number), category, description, email, locale, turnstile: captcha }),
      });
      setReference(result.reference);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
      setResetKey((k) => k + 1);
    }
  };

  if (reference) {
    return (
      <div className="notice" role="status">
        <p>
          <b>{t("thanks")}</b>
        </p>
        <p>{t("reference", { reference })}</p>
        <p>{email ? t("willAnswer") : t("noAnswer")}</p>
      </div>
    );
  }

  return (
    <form
      className="report-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="field">
        {t("rentalNo")} <span className="muted small">{t("rentalNoHelp")}</span>
        <input type="text" inputMode="numeric" required maxLength={9} value={number} onChange={(e) => setRentalNo(e.target.value.replace(/\D/g, ""))} />
      </label>
      <label className="field">
        {t("category")}
        <select required value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t("choose")}</option>
          {REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {tr(code)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t("description")} <span className="muted small">{category === "other" ? t("required") : t("optional")}</span>
        <textarea rows={5} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        {t("email")} <span className="muted small">{t("emailHelp")}</span>
        <input type="email" maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Turnstile siteKey={siteKey} onToken={setCaptcha} resetKey={resetKey} />
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      <p>
        <button type="submit" className="btn" disabled={busy || !number || !category || (siteKey !== null && !captcha)}>
          {busy ? t("sending") : t("send")}
        </button>
      </p>
      <p className="muted small">{t("privacy")}</p>
    </form>
  );
}
