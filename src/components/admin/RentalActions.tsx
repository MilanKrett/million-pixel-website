"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import { formatMoney } from "@/lib/money";
import { DecisionForm, type DecisionInput } from "./DecisionForm";

type Open = null | "hide" | "remove" | "extend" | "refund";

/** Admin actions on one rental; the page reloads after each, so the history below is current. */
export function RentalActions({
  rentalId,
  status,
  hidden,
  isReserved,
  refundableCents,
  currency,
  endsAt,
  testTools,
}: {
  rentalId: string;
  status: string;
  hidden: boolean;
  isReserved: boolean;
  refundableCents: number;
  currency: string;
  /** Current end (ISO), for the testing tool. */
  endsAt: string | null;
  /** Local computer only: move the end date to try reminders and the grace period. */
  testTools: boolean;
}) {
  const t = useTranslations("admin.rental");
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState("30");
  const [amount, setAmount] = useState("");
  const [endRental, setEndRental] = useState(false);
  const [notifyRenter, setNotifyRenter] = useState(true);
  const [testEnd, setTestEnd] = useState(() => (endsAt ? toLocalInput(new Date(endsAt)) : ""));
  const running = status === "active" || status === "grace";

  const run = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/rentals/${rentalId}`, { method: "POST", body: JSON.stringify(body) });
      window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
      setBusy(false);
    }
  };

  const decision = (action: "hide" | "remove") => (input: DecisionInput) =>
    run({ action, reasonCode: input.reasonCode, note: input.note }, action === "remove" ? t("confirmRemove") : undefined);

  return (
    <div className="admin-actions-box">
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      {open === "hide" || open === "remove" ? (
        <DecisionForm
          title={open === "hide" ? t("hideTitle") : t("removeTitle")}
          submitLabel={open === "hide" ? t("hide") : t("remove")}
          busy={busy}
          onSubmit={decision(open)}
          onCancel={() => setOpen(null)}
        />
      ) : open === "extend" ? (
        <form
          className="decision-form"
          onSubmit={(e) => {
            e.preventDefault();
            run({ action: "extend", days: Number(days), notify: notifyRenter });
          }}
        >
          <b>{t("extendTitle")}</b>
          <label className="field">
            {t("days")}
            <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
          {!isReserved && (
            <label className="check-line">
              <input type="checkbox" checked={notifyRenter} onChange={(e) => setNotifyRenter(e.target.checked)} /> {t("notifyRenter")}
            </label>
          )}
          <p>
            <button type="submit" className="btn btn-rent" disabled={busy}>
              {t("extend")}
            </button>{" "}
            <button type="button" className="btn" onClick={() => setOpen(null)}>
              {t("cancel")}
            </button>
          </p>
        </form>
      ) : open === "refund" ? (
        <form
          className="decision-form"
          onSubmit={(e) => {
            e.preventDefault();
            run({ action: "refund", amount: amount.trim() === "" ? null : amount.replace(",", "."), endRental }, t("confirmRefund"));
          }}
        >
          <b>{t("refundTitle")}</b>
          <p className="small">{t("refundable", { amount: formatMoney(refundableCents, currency, "sk-SK") })}</p>
          <label className="field">
            {t("refundAmount")}
            <input type="text" inputMode="decimal" placeholder={t("refundAll")} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="check-line">
            <input type="checkbox" checked={endRental} onChange={(e) => setEndRental(e.target.checked)} /> {t("refundEnd")}
          </label>
          <p>
            <button type="submit" className="btn btn-rent" disabled={busy}>
              {t("refund")}
            </button>{" "}
            <button type="button" className="btn" onClick={() => setOpen(null)}>
              {t("cancel")}
            </button>
          </p>
        </form>
      ) : (
        <p className="admin-actions">
          {hidden ? (
            <button type="button" className="btn" disabled={busy} onClick={() => run({ action: "unhide" })}>
              {t("unhide")}
            </button>
          ) : (
            ["active", "grace", "in_review", "rejected"].includes(status) && (
              <button type="button" className="btn" onClick={() => setOpen("hide")}>
                {t("hide")}
              </button>
            )
          )}{" "}
          {running && !isReserved && (
            <button type="button" className="btn" onClick={() => setOpen("remove")}>
              {t("remove")}
            </button>
          )}{" "}
          {running && (
            <button type="button" className="btn" onClick={() => setOpen("extend")}>
              {t("extendTitle")}
            </button>
          )}{" "}
          {refundableCents > 0 && (
            <button type="button" className="btn" onClick={() => setOpen("refund")}>
              {t("refundTitle")}
            </button>
          )}{" "}
          {isReserved && running && (
            <button type="button" className="btn" disabled={busy} onClick={() => run({ action: "endReserved" }, t("confirmEndReserved"))}>
              {t("endReserved")}
            </button>
          )}
        </p>
      )}
      {testTools && running && (
        <form
          className="decision-form test-tools"
          onSubmit={(e) => {
            e.preventDefault();
            if (testEnd) run({ action: "testEndsAt", endsAt: new Date(testEnd).toISOString() });
          }}
        >
          <b>{t("testTitle")}</b>
          <p className="small muted">{t("testHelp")}</p>
          <label className="field">
            {t("endsAt")}
            <input type="datetime-local" value={testEnd} onChange={(e) => setTestEnd(e.target.value)} />
          </label>
          <p>
            <button type="submit" className="btn" disabled={busy || !testEnd}>
              {t("setEnd")}
            </button>
          </p>
        </form>
      )}
    </div>
  );
}

/** "2026-10-11T14:05" in the browser's time zone, for <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
