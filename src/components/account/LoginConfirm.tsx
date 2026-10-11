"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "use-intl/react";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import { api, ApiError } from "@/components/rent/shared";

// The token arrives in the #fragment (never sent to servers or logged). It is
// read once and removed from the address bar.
let captured: string | null | undefined;
function readToken(): string | null {
  if (captured === undefined) {
    const raw = window.location.hash.slice(1);
    captured = /^[A-Za-z0-9_-]{40,60}$/.test(raw) ? raw : null;
    if (raw) window.history.replaceState(null, "", window.location.pathname);
  }
  return captured;
}
const subscribe = () => () => {};

/**
 * Finishing the sign-in needs a click: some e-mail security scanners open
 * links automatically, and a link that signed in on its own would be used up
 * by them.
 */
export function LoginConfirm() {
  const t = useTranslations("login");
  const locale = useAppLocale();
  const token = useSyncExternalStore(subscribe, readToken, () => undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (token === undefined) return <p>{t("checking")}</p>;

  if (token === null || error === "link_invalid") {
    return (
      <div className="notice">
        <p>{t("linkInvalid")}</p>
        <p>
          <a href={localePath(locale, "/login")}>{t("newLink")}</a>
        </p>
      </div>
    );
  }

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { next } = await api<{ next: string }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) });
      window.location.assign(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
      setBusy(false);
    }
  };

  return (
    <div>
      <p>{t("confirmText")}</p>
      {error && (
        <p className="error" role="alert">
          {t("errors.error")}
        </p>
      )}
      <p>
        <button type="button" className="btn btn-rent" onClick={confirm} disabled={busy}>
          {busy ? t("signingIn") : t("confirmButton")}
        </button>
      </p>
    </div>
  );
}
