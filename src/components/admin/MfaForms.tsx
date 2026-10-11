"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";

function useCodeForm(action: "enable" | "verify", onDone: (body: { recoveryCodes?: string[] }) => void) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api<{ recoveryCodes?: string[] }>("/api/auth/2fa", { method: "POST", body: JSON.stringify({ action, code }) }));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
      setBusy(false);
    }
  };
  return { code, setCode, busy, error, submit };
}

function CodeForm({ form, label, button, allowRecovery }: { form: ReturnType<typeof useCodeForm>; label: string; button: string; allowRecovery: boolean }) {
  const t = useTranslations("admin.mfa");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
    >
      <label className="field">
        {label}
        <input
          type="text"
          inputMode={allowRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoFocus
          maxLength={allowRecovery ? 20 : 6}
          value={form.code}
          onChange={(e) => form.setCode(e.target.value)}
          className="mfa-code"
        />
      </label>
      {form.error && (
        <p className="error" role="alert">
          {t.has(`errors.${form.error}`) ? t(`errors.${form.error}` as "errors.invalid") : t("errors.invalid")}
        </p>
      )}
      <p>
        <button type="submit" className="btn btn-rent" disabled={form.busy || form.code.trim().length < 6}>
          {button}
        </button>
      </p>
    </form>
  );
}

/** Finish the setup with the first code; then show the recovery codes once. */
export function MfaSetup() {
  const t = useTranslations("admin.mfa");
  const [codes, setCodes] = useState<string[] | null>(null);
  const form = useCodeForm("enable", (body) => setCodes(body.recoveryCodes ?? []));
  if (codes) {
    return (
      <div className="notice">
        <p>
          <b>{t("enabled")}</b>
        </p>
        <p>{t("recoveryIntro")}</p>
        <pre className="mfa-recovery">{codes.join("\n")}</pre>
        <p>
          <Link className="btn btn-rent" href="/admin">
            {t("continue")}
          </Link>
        </p>
      </div>
    );
  }
  return <CodeForm form={form} label={t("codeLabel")} button={t("enable")} allowRecovery={false} />;
}

/** Confirm the second factor for this session. */
export function MfaVerify({ next }: { next: string }) {
  const t = useTranslations("admin.mfa");
  const form = useCodeForm("verify", () => window.location.assign(next));
  return (
    <>
      <CodeForm form={form} label={t("codeOrRecovery")} button={t("verify")} allowRecovery />
      <p className="muted small">{t("lostPhone")}</p>
    </>
  );
}
