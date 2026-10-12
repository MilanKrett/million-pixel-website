"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import { useAppLocale } from "@/i18n/provider";
import { CONTACT_LIMITS, CONTACT_TOPICS } from "@/lib/contact-topics";
import { Turnstile } from "./Turnstile";

/** The contact form; the server checks everything again. */
export function ContactForm({ siteKey }: { siteKey: string | null }) {
  const t = useTranslations("contact");
  const locale = useAppLocale();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="notice" role="status">
        {t("sent", { email: sent })}
      </p>
    );
  }

  const submit = async (form: FormData) => {
    setBusy(true);
    setError(null);
    try {
      const { email } = await api<{ email: string }>("/api/contact", {
        method: "POST",
        body: JSON.stringify({
          topic: form.get("topic"),
          name: form.get("name"),
          email: form.get("email"),
          rentalNo: form.get("rentalNo"),
          message: form.get("message"),
          locale,
          turnstile: captcha,
        }),
      });
      setSent(email);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "error");
      setCaptchaReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="contact-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <label className="field">
        {t("topic")}
        <select name="topic" defaultValue="general">
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {t(`topics.${topic}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t("name")} <span className="muted small">{t("optional")}</span>
        <input name="name" type="text" maxLength={100} autoComplete="name" />
      </label>
      <label className="field">
        {t("email")}
        <input name="email" type="email" required maxLength={254} autoComplete="email" />
      </label>
      <label className="field">
        {t("spotNo")} <span className="muted small">{t("spotNoHelp")}</span>
        <input name="rentalNo" type="number" min={1} inputMode="numeric" />
      </label>
      <label className="field">
        {t("message")}
        <textarea name="message" rows={6} required maxLength={CONTACT_LIMITS.maxMessage} />
      </label>
      <Turnstile siteKey={siteKey} onToken={setCaptcha} resetKey={captchaReset} />
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      <p>
        <button type="submit" className="btn" disabled={busy || (siteKey !== null && !captcha)}>
          {busy ? t("sending") : t("send")}
        </button>
      </p>
      <p className="muted small">{t("privacy")}</p>
    </form>
  );
}
