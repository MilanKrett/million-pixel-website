"use client";

import { ADMIN_LOCALES, type AdminLocale } from "@/i18n/config";

/** EN | SK for the admin (stored with the account). */
export function LocaleSwitch({ current }: { current: AdminLocale }) {
  const change = async (locale: AdminLocale) => {
    await fetch("/api/admin/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale }) });
    window.location.reload();
  };
  return (
    <span>
      {ADMIN_LOCALES.map((l, i) => (
        <span key={l}>
          {i > 0 && " | "}
          {l === current ? (
            <b>{l.toUpperCase()}</b>
          ) : (
            <button type="button" className="link-button" onClick={() => change(l)}>
              {l.toUpperCase()}
            </button>
          )}
        </span>
      ))}
    </span>
  );
}
