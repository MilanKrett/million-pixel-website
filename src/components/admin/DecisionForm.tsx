"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { REASON_CODES, type ReasonCode } from "@/lib/email/reasons";

export interface DecisionInput {
  reasonCode: ReasonCode;
  note: string;
  extra: boolean;
}

/**
 * Reason (a content rule) + an optional note for the renter. The reason
 * templates are the rule names in the renter's language; the note is free
 * text. `extraLabel` adds one checkbox (e.g. "refund now").
 */
export function DecisionForm({
  title,
  submitLabel,
  extraLabel,
  initialReason,
  busy,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  extraLabel?: string;
  initialReason?: ReasonCode;
  busy: boolean;
  onSubmit: (input: DecisionInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.decision");
  const tr = useTranslations("reasons");
  const [reasonCode, setReasonCode] = useState<ReasonCode | "">(initialReason ?? "");
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState(false);

  return (
    <form
      className="decision-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (reasonCode) onSubmit({ reasonCode, note, extra });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <b>{title}</b>
      <label className="field">
        {t("reason")}
        <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value as ReasonCode)} autoFocus required>
          <option value="">{t("choose")}</option>
          {REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {tr(code)}
            </option>
          ))}
        </select>
      </label>
      {reasonCode === "child" && <p className="warning small">{t("childWarning")}</p>}
      <label className="field">
        {t("note")} <span className="muted small">{t("noteHelp")}</span>
        <textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {extraLabel && (
        <label className="check-line">
          <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} /> {extraLabel}
        </label>
      )}
      <p>
        <button type="submit" className="btn btn-rent" disabled={busy || !reasonCode}>
          {submitLabel}
        </button>{" "}
        <button type="button" className="btn" onClick={onCancel}>
          {t("cancel")}
        </button>
      </p>
    </form>
  );
}
