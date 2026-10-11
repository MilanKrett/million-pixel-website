"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/config";
import type { LocalizedText, Settings, SettingKey } from "@/lib/settings/schema";

type Kind = "text" | "longtext" | "int" | "number" | "nullableInt" | "bool" | "formats" | "localized" | "localizedLong";
type LocalizedKey = "tagline" | "announcement";

const GROUPS: { key: string; fields: [SettingKey, Kind][] }[] = [
  {
    key: "site",
    fields: [
      ["site_name", "text"],
      ["tagline", "localized"],
      ["operator_name", "text"],
      ["operator_id", "text"],
      ["operator_address", "text"],
      ["contact_email", "text"],
    ],
  },
  {
    key: "prices",
    fields: [
      ["price_cents_per_pixel", "number"],
      ["currency", "text"],
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
      ["announcement", "localizedLong"],
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
  if (kind === "nullableInt") return value === null ? "" : String(value);
  if (kind === "bool" || kind === "formats" || kind === "localized" || kind === "localizedLong") return "";
  return String(value ?? "");
}

function fromText(kind: Kind, text: string): unknown {
  const trimmed = text.trim();
  if (kind === "int") return trimmed === "" ? NaN : Number(trimmed);
  if (kind === "number") return trimmed === "" ? NaN : Number(trimmed.replace(",", "."));
  if (kind === "nullableInt") return trimmed === "" ? null : Number(trimmed);
  return text;
}

const localizedState = (value: LocalizedText): Record<Locale, string> =>
  Object.fromEntries(LOCALES.map((l) => [l, value[l] ?? ""])) as Record<Locale, string>;

/** Only the languages with a text are stored. */
const localizedValue = (texts: Record<Locale, string>): LocalizedText =>
  Object.fromEntries(LOCALES.filter((l) => texts[l].trim()).map((l) => [l, texts[l].trim()]));

/**
 * Every setting of section 2 of the spec, plus the announcement and the site
 * switches. `sloganDefaults` are the built-in slogans, shown where a language
 * has no own text.
 */
export function SettingsForm({ initial, geometryLocked, sloganDefaults }: { initial: Settings; geometryLocked: boolean; sloganDefaults: Record<Locale, string> }) {
  const t = useTranslations("admin.settings");
  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const g of GROUPS) for (const [key, kind] of g.fields) out[key] = toText(kind, initial[key]);
    return out;
  });
  const [bools, setBools] = useState({ vat_payer: initial.vat_payer, sales_paused: initial.sales_paused, direct_link_open: initial.direct_link_open });
  const [formats, setFormats] = useState<string[]>(initial.upload_formats);
  const [localized, setLocalized] = useState<Record<LocalizedKey, Record<Locale, string>>>(() => ({
    tagline: localizedState(initial.tagline),
    announcement: localizedState(initial.announcement),
  }));
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
    const values: Record<string, unknown> = {
      ...bools,
      upload_formats: formats,
      tagline: localizedValue(localized.tagline),
      announcement: localizedValue(localized.announcement),
    };
    for (const g of GROUPS) {
      for (const [key, kind] of g.fields) {
        if (kind === "bool" || kind === "formats" || kind === "localized" || kind === "localizedLong") continue;
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
            const help = t.has(`help.${key}` as "help.tagline") ? t(`help.${key}` as "help.tagline") : null;
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
            if (kind === "localized" || kind === "localizedLong") {
              const field = key as LocalizedKey;
              return (
                <div key={key} className="field">
                  {label} {help && <span className="muted small">{help}</span>}
                  <table className="data localized-texts">
                    <tbody>
                      {LOCALES.map((l) => {
                        const fieldError = errors[`${key}.${l}`];
                        const change = (value: string) => setLocalized((all) => ({ ...all, [field]: { ...all[field], [l]: value } }));
                        return (
                          <tr key={l}>
                            <th scope="row" title={LOCALE_NAMES[l]}>
                              {l.toUpperCase()}
                            </th>
                            <td>
                              {kind === "localizedLong" ? (
                                <textarea rows={1} lang={l} aria-label={`${label} (${LOCALE_NAMES[l]})`} value={localized[field][l]} onChange={(e) => change(e.target.value)} />
                              ) : (
                                <input
                                  type="text"
                                  lang={l}
                                  aria-label={`${label} (${LOCALE_NAMES[l]})`}
                                  placeholder={field === "tagline" ? sloganDefaults[l] : undefined}
                                  value={localized[field][l]}
                                  onChange={(e) => change(e.target.value)}
                                />
                              )}
                              {fieldError && <span className="field-error">{errorText(fieldError)}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {error}
                </div>
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
