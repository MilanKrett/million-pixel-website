"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";

async function tool(body: Record<string, unknown>) {
  return api<{ ok: true; version?: number | null; ms?: number | null }>("/api/admin/tools", { method: "POST", body: JSON.stringify(body) });
}

/** Rebuild the whole wall image from the tiles (normally only changed areas are redrawn). */
export function WallRebuild() {
  const t = useTranslations("admin.tools");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <p>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await tool({ action: "render" });
            setResult(t("wallDone", { version: r.version ?? 0, ms: r.ms ?? 0 }));
          } catch {
            setResult(t("failed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("wallButton")}
      </button>{" "}
      {result && <span className="muted">{result}</span>}
    </p>
  );
}

export function StaffRow({ id, email, role, mfa, lastLogin, self }: { id: string; email: string; role: string; mfa: boolean; lastLogin: string; self: boolean }) {
  const t = useTranslations("admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      await tool(body);
      window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
      setBusy(false);
    }
  };
  return (
    <tr>
      <td>{email}</td>
      <td>{t(`roles.${role}` as "roles.admin")}</td>
      <td>{mfa ? t("tools.mfaOn") : t("tools.mfaOff")}</td>
      <td>{lastLogin}</td>
      <td>
        {!self && (
          <>
            <button type="button" className="link-button" disabled={busy} onClick={() => run({ action: "role", email, role: "user" }, t("tools.confirmRemove", { email }))}>
              {t("tools.removeRole")}
            </button>{" "}
            {mfa && (
              <button type="button" className="link-button" disabled={busy} onClick={() => run({ action: "resetMfa", userId: id }, t("tools.confirmResetMfa", { email }))}>
                {t("tools.resetMfa")}
              </button>
            )}
          </>
        )}
        {error && <span className="field-error">{t.has(`tools.errors.${error}`) ? t(`tools.errors.${error}` as "tools.errors.error") : t("tools.errors.error")}</span>}
      </td>
    </tr>
  );
}

/** Give someone the moderator or admin role (they get an e-mail and set up two-factor login). */
export function RolesForm() {
  const t = useTranslations("admin.tools");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"moderator" | "admin">("moderator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="field-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await tool({ action: "role", email, role });
          window.location.reload();
        } catch (err) {
          setError(err instanceof ApiError ? err.code : "network");
          setBusy(false);
        }
      }}
    >
      <label>
        {t("email")}
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        {t("role")}
        <select value={role} onChange={(e) => setRole(e.target.value as "moderator" | "admin")}>
          <option value="moderator">{t("roleModerator")}</option>
          <option value="admin">{t("roleAdmin")}</option>
        </select>
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {t("addRole")}
      </button>
      {error && <span className="field-error">{t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}</span>}
    </form>
  );
}
