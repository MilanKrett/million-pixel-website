"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import type { Settings, SettingKey } from "@/lib/settings/schema";

type Kind = "text" | "longtext" | "int" | "number" | "nullableInt" | "bool" | "periods" | "days" | "formats";

const GROUPS: { key: string; fields: [SettingKey, Kind][] }[] = [
  {
    key: "site",
    fields: [
      ["site_name", "text"],
      ["tagline_en", "text"],
      ["tagline_sk", "text"],
      ["operator_name", "text"],
      ["operator_id", "text"],
      ["operator_address", "text"],
      ["contact_email", "text"],
    ],
  },
  {
    key: "prices",
    fields: [
      ["price_cents_per_pixel_year", "number"],
      ["currency", "text"],
      ["periods", "periods"],
      ["min_blocks", "int"],
      ["max_blocks", "nullableInt"],
      ["vat_payer", "bool"],
      ["vat_rate_pct", "number"],
    ],
  },
  {
    key: "deadlines",
    fields: [
      ["hold_minutes", "int"],
      ["checkout_hold_minutes", "int"],
      ["review_hours", "int"],
      ["reupload_days", "int"],
      ["grace_days", "int"],
      ["reminder_days", "days"],
      ["magic_link_minutes", "int"],
      ["transfer_days", "int"],
      ["max_active_holds", "int"],
    ],
  },
  {
    key: "uploads",
    fields: [
      ["upload_max_mb", "number"],
      ["upload_max_px", "int"],
      ["upload_formats", "formats"],
    ],
  },
  {
    key: "switches",
    fields: [
      ["announcement_en", "longtext"],
      ["announcement_sk", "longtext"],
      ["sales_paused", "bool"],
      ["direct_link_open", "bool"],
    ],
  },
  {
    key: "geometry",
    fields: [
      ["wall_width_px", "int"],
      ["wall_height_px", "int"],
      ["block_size_px", "int"],
    ],
  },
];

const FORMATS = ["png", "jpeg", "webp", "gif"] as const;

function toText(kind: Kind, value: unknown): string {
  if (kind === "periods") return (value as Settings["periods"]).map((p) => `${p.years}:${p.discount_pct}`).join(", ");
  if (kind === "days") return (value as number[]).join(", ");
  if (kind === "nullableInt") return value === null ? "" : String(value);
  if (kind === "bool" || kind === "formats") return "";
  return String(value ?? "");
}

function fromText(kind: Kind, text: string): unknown {
  const trimmed = text.trim();
  if (kind === "int") return trimmed === "" ? NaN : Number(trimmed);
  if (kind === "number") return trimmed === "" ? NaN : Number(trimmed.replace(",", "."));
  if (kind === "nullableInt") return trimmed === "" ? null : Number(trimmed);
  if (kind === "periods") {
    return trimmed
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((part) => {
        const [years, discount] = part.split(":");
        return { years: Number(years), discount_pct: Number(discount ?? 0) };
      });
  }
  if (kind === "days") return trimmed.split(/[,;\s]+/).filter(Boolean).map(Number);
  return text;
}

/** Every setting of section 2 of the spec, plus the announcement and the site switches. */
export function SettingsForm({ initial, geometryLocked }: { initial: Settings; geometryLocked: boolean }) {
  const t = useTranslations("admin.settings");
  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const g of GROUPS) for (const [key, kind] of g.fields) out[key] = toText(kind, initial[key]);
    return out;
  });
  const [bools, setBools] = useState({ vat_payer: initial.vat_payer, sales_paused: initial.sales_paused, direct_link_open: initial.direct_link_open });
  const [formats, setFormats] = useState<string[]>(initial.upload_formats);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const errorText = (code: string) => {
    const [kind, limit] = code.split(":");
    if (kind === "locked") return t("geometryLocked");
    if (kind === "too_small") return t("tooSmall", { limit: limit ?? "" });
    if (kind === "too_big") return t("tooBig", { limit: limit ?? "" });
    if (kind === "custom") return t("blockMultiple");
    return t("invalidValue");
  };

  const save = async () => {
    setBusy(true);
    setErrors({});
    setSaved(null);
    setFailure(null);
    const values: Record<string, unknown> = { ...bools, upload_formats: formats };
    for (const g of GROUPS) {
      for (const [key, kind] of g.fields) {
        if (kind === "bool" || kind === "formats") continue;
        if (g.key === "geometry" && geometryLocked) continue;
        values[key] = fromText(kind, texts[key] ?? "");
      }
    }
    try {
      const { changed } = await api<{ changed: string[] }>("/api/admin/settings", { method: "POST", body: JSON.stringify({ values }) });
      setSaved(changed);
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_settings") setErrors((e.body.errors ?? {}) as Record<string, string>);
      else setFailure(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {GROUPS.map((group) => (
        <fieldset key={group.key} className="settings-group">
          <legend>{t(`groups.${group.key}` as "groups.site")}</legend>
          {group.key === "geometry" && <p className="muted small">{geometryLocked ? t("geometryLocked") : t("geometryHelp")}</p>}
          {group.fields.map(([key, kind]) => {
            const label = t(`fields.${key}` as "fields.site_name");
            const help = t.has(`help.${key}` as "help.periods") ? t(`help.${key}` as "help.periods") : null;
            const disabled = group.key === "geometry" && geometryLocked;
            const error = errors[key] ? <span className="field-error">{errorText(errors[key]!)}</span> : null;
            if (kind === "bool") {
              return (
                <label key={key} className="check-line">
                  <input
                    type="checkbox"
                    checked={bools[key as keyof typeof bools]}
                    onChange={(e) => setBools((b) => ({ ...b, [key]: e.target.checked }))}
                  />{" "}
                  {label} {help && <span className="muted small">— {help}</span>}
                  {error}
                </label>
              );
            }
            if (kind === "formats") {
              return (
                <div key={key} className="field">
                  {label}
                  <span>
                    {FORMATS.map((format) => (
                      <label key={format} className="inline-check">
                        <input
                          type="checkbox"
                          checked={formats.includes(format)}
                          onChange={(e) => setFormats((list) => (e.target.checked ? [...list, format] : list.filter((f) => f !== format)))}
                        />{" "}
                        {format.toUpperCase()}
                      </label>
                    ))}
                  </span>
                  {error}
                </div>
              );
            }
            return (
              <label key={key} className="field">
                {label} {help && <span className="muted small">{help}</span>}
                {kind === "longtext" ? (
                  <textarea rows={2} value={texts[key]} onChange={(e) => setTexts((s) => ({ ...s, [key]: e.target.value }))} />
                ) : (
                  <input
                    type="text"
                    inputMode={kind === "text" ? undefined : "decimal"}
                    value={texts[key]}
                    disabled={disabled}
                    onChange={(e) => setTexts((s) => ({ ...s, [key]: e.target.value }))}
                  />
                )}
                {error}
              </label>
            );
          })}
        </fieldset>
      ))}
      {failure && (
        <p className="error" role="alert">
          {t("error")}
        </p>
      )}
      {saved && (
        <p className="notice" role="status">
          {saved.length ? t("saved", { count: saved.length }) : t("nothingChanged")}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p className="error" role="alert">
          {t("fixErrors")}
        </p>
      )}
      <p>
        <button type="submit" className="btn btn-rent" disabled={busy}>
          {t("save")}
        </button>
      </p>
    </form>
  );
}
