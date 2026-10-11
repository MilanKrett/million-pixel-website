"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import type { Locale } from "@/i18n/config";

interface Field {
  key: string;
  original: string;
  value: string | null;
}

/** One textarea per text; empty = back to the original. Placeholders like {title} must stay valid. */
export function EmailTextEditor({ locale, fields }: { locale: Locale; fields: Field[] }) {
  return (
    <div className="email-texts">
      {fields.map((f) => (
        <TextField key={`${locale}:${f.key}`} locale={locale} field={f} />
      ))}
    </div>
  );
}

function TextField({ locale, field }: { locale: Locale; field: Field }) {
  const t = useTranslations("admin.emails");
  const router = useRouter();
  const [value, setValue] = useState(field.value ?? field.original);
  const [saved, setSaved] = useState(field.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const changed = value !== (saved ?? field.original);

  const save = async (next: string | null) => {
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await api("/api/admin/emails", { method: "POST", body: JSON.stringify({ locale, key: field.key, value: next }) });
      const stored = next === null || next.trim() === field.original ? null : next.trim();
      setSaved(stored);
      setValue(stored ?? field.original);
      setOk(true);
      // Redraw the preview next to the texts.
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) setError(e.body.detail ? `${t(`errors.${e.code}` as "errors.syntax")} (${String(e.body.detail)})` : t(`errors.${e.code}` as "errors.syntax"));
      else setError(t("errors.network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field email-text-field">
      <label>
        <code>{field.key}</code> {saved !== null && <span className="small muted">({t("customized")})</span>}
        <textarea rows={Math.min(6, Math.max(2, Math.ceil(value.length / 70)))} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      {error && <span className="field-error">{error}</span>}
      <span className="small">
        <button type="button" className="btn" disabled={busy || !changed} onClick={() => save(value)}>
          {t("save")}
        </button>{" "}
        {saved !== null && (
          <button type="button" className="link-button" disabled={busy} onClick={() => save(null)}>
            {t("reset")}
          </button>
        )}{" "}
        {ok && <span className="muted">{t("savedNote")}</span>}
      </span>
    </div>
  );
}
