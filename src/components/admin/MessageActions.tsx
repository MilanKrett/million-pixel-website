"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { api } from "@/components/rent/shared";

/** "Mark as handled" / "Open again" for one contact message. */
export function MessageActions({ id, done }: { id: string; done: boolean }) {
  const t = useTranslations("admin.messages");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          try {
            await api(`/api/admin/messages/${id}`, { method: "POST", body: JSON.stringify({ done: !done }) });
            window.location.reload();
          } catch {
            setError(true);
            setBusy(false);
          }
        }}
      >
        {done ? t("reopen") : t("markDone")}
      </button>
      {error && <span className="field-error">{t("error")}</span>}
    </>
  );
}
