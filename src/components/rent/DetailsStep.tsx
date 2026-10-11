"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "use-intl/react";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import { formatMoney } from "@/lib/money";
import { api, ApiError, type CarriedTexts, type OrderResponse } from "./shared";

type Field = "title" | "url" | "displayName" | "email" | "terms" | "waiver";

/** Step 4 of the spec: title, link, public name, e-mail and consents. */
export function DetailsStep({
  order,
  carried,
  onSaved,
  onBack,
}: {
  order: OrderResponse;
  /** Texts entered for the previous place, used when this order has none yet. */
  carried?: CarriedTexts | null;
  onSaved: (order: OrderResponse) => void;
  onBack: () => void;
}) {
  const t = useTranslations("rent");
  const locale = useAppLocale();
  const intlLocale = useLocale();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const texts = order.content?.title ? order.content : (carried ?? order.content);
  const [title, setTitle] = useState(texts?.title ?? "");

  const submit = async (form: FormData) => {
    setBusy(true);
    setFailure(null);
    try {
      const { order: fresh } = await api<{ order: OrderResponse }>(`/api/rentals/${order.id}/details`, {
        method: "PUT",
        body: JSON.stringify({
          title: form.get("title"),
          url: form.get("url"),
          displayName: form.get("displayName"),
          email: form.get("email"),
          terms: form.get("terms") === "on",
          waiver: form.get("waiver") === "on",
          marketing: form.get("marketing") === "on",
          locale,
        }),
      });
      setErrors({});
      onSaved(fresh);
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_details") setErrors((e.body.errors ?? {}) as Partial<Record<Field, string>>);
      else setFailure(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  const err = (f: Field) =>
    errors[f] ? (
      <span className="field-error" id={`err-${f}`}>
        {t(`detailErrors.${errors[f]}` as "detailErrors.titleRequired")}
      </span>
    ) : null;
  const described = (f: Field) => (errors[f] ? { "aria-invalid": true, "aria-describedby": `err-${f}` } : {});

  return (
    <form
      className="rent-details"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <h2>{t("detailsTitle")}</h2>
      <label className="field">
        {t("fields.title")} <span className="muted small">{t("fields.titleNote", { left: 80 - [...title].length })}</span>
        <input name="title" type="text" maxLength={80} required value={title} onChange={(e) => setTitle(e.target.value)} {...described("title")} />
        {err("title")}
      </label>
      <label className="field">
        {t("fields.url")} <span className="muted small">{t("fields.optional")}</span>
        <input name="url" type="text" inputMode="url" placeholder="https://" defaultValue={texts?.url ?? ""} maxLength={2048} {...described("url")} />
        {err("url")}
      </label>
      <label className="field">
        {t("fields.displayName")} <span className="muted small">{t("fields.optional")}</span>
        <input name="displayName" type="text" maxLength={60} defaultValue={texts?.displayName ?? ""} {...described("displayName")} />
        {err("displayName")}
      </label>
      <label className="field">
        {t("fields.email")} <span className="muted small">{t("fields.emailNote")}</span>
        <input name="email" type="email" autoComplete="email" required defaultValue={order.email ?? ""} maxLength={254} {...described("email")} />
        {err("email")}
      </label>

      {order.quote && (
        <p className="field">
          {t("fields.price")} <b>{formatMoney(order.quote.totalCents, order.quote.currency, intlLocale)}</b>{" "}
          <span className="muted small">{t("priceOnce")}</span>
        </p>
      )}

      <fieldset className="field">
        <legend className="visually-hidden">{t("fields.consents")}</legend>
        <label className="check-line">
          <input name="terms" type="checkbox" defaultChecked={order.termsAccepted} {...described("terms")} />{" "}
          {t.rich("fields.terms", {
            terms: (chunks) => (
              <a href={localePath(locale, "/terms")} target="_blank" rel="noopener">
                {chunks}
              </a>
            ),
            rules: (chunks) => (
              <a href={localePath(locale, "/content-rules")} target="_blank" rel="noopener">
                {chunks}
              </a>
            ),
          })}
        </label>
        {err("terms")}
        <label className="check-line">
          <input name="waiver" type="checkbox" defaultChecked={order.waiver} {...described("waiver")} /> {t("fields.waiver")}
        </label>
        {err("waiver")}
        <label className="check-line">
          <input name="marketing" type="checkbox" defaultChecked={order.marketing} /> {t("fields.marketing")}
        </label>
      </fieldset>

      {failure && (
        <p className="error" role="alert">
          {t.has(`contentErrors.${failure}`) ? t(`contentErrors.${failure}` as "contentErrors.error") : t("contentErrors.error")}
        </p>
      )}
      <p>
        <button type="button" className="btn" onClick={onBack}>
          « {t("back")}
        </button>{" "}
        <button type="submit" className="btn btn-rent" disabled={busy}>
          {busy ? t("saving") : t("continue")}
        </button>
      </p>
    </form>
  );
}
