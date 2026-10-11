"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "use-intl/react";
import { api } from "@/components/rent/shared";

// The token arrives in the #fragment; it is read once and removed from the address bar.
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

/** Accepting a rental someone gave you: one click, then you are its owner and signed in. */
export function TransferAccept() {
  const t = useTranslations("transfer");
  const token = useSyncExternalStore(subscribe, readToken, () => undefined);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (token === undefined) return <p>…</p>;
  if (token === null || failed) return <p className="notice">{t("invalid")}</p>;

  const accept = async () => {
    setBusy(true);
    try {
      const { next } = await api<{ next: string }>("/api/transfer/accept", { method: "POST", body: JSON.stringify({ token }) });
      window.location.assign(next);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <>
      <p>{t("intro")}</p>
      <p>
        <button type="button" className="btn btn-rent" onClick={accept} disabled={busy}>
          {t("accept")}
        </button>
      </p>
    </>
  );
}
