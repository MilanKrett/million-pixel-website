"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import { api, ApiError } from "@/components/rent/shared";
import { Turnstile } from "@/components/site/Turnstile";

/** E-mail address → sign-in link. */
export function LoginForm({
  next,
  minutes,
  siteKey,
  devEmails,
}: {
  next: string | null;
  minutes: number;
  siteKey: string | null;
  devEmails: boolean;
}) {
  const t = useTranslations("login");
  const locale = useAppLocale();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, locale, next, turnstile: captcha }) });
      setSentTo(email.trim());
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
      setResetKey((k) => k + 1);
    }
  };

  if (sentTo) {
    return (
      <div className="notice" role="status">
        <p>
          <b>{t("sent", { email: sentTo, minutes })}</b>
        </p>
        <p>{t("spam")}</p>
        {devEmails && (
          <p>
            {t("devEmails")} <a href={localePath(locale, "/dev/emails")}>/dev/emails</a>
          </p>
        )}
        <p>
          <button type="button" className="link-button" onClick={() => setSentTo(null)}>
            {t("again")}
          </button>
        </p>
      </div>
    );
  }

  return (
    <form
      className="login-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="field">
        {t("email")}
        <input type="email" name="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Turnstile siteKey={siteKey} onToken={setCaptcha} resetKey={resetKey} />
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      <p>
        <button type="submit" className="btn btn-rent" disabled={busy || (siteKey !== null && !captcha)}>
          {busy ? t("sending") : t("send")}
        </button>
      </p>
    </form>
  );
}
