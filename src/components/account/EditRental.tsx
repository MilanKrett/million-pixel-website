"use client";

import { useState } from "react";
import { useTranslations } from "use-intl/react";
import { PixelEditor } from "@/components/rent/PixelEditor";
import { Preview } from "@/components/rent/Preview";
import { api, ApiError, type OrderResponse, type RentConfig } from "@/components/rent/shared";
import { TextEditor } from "@/components/rent/TextEditor";
import { UploadEditor } from "@/components/rent/UploadEditor";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";

type Tab = "upload" | "draw" | "text";
type Field = "title" | "url" | "displayName";

interface CurrentContent {
  id: string;
  kind: string;
  title: string | null;
  url: string | null;
  displayName: string | null;
  params: Record<string, unknown>;
}

/**
 * Changing a running rental from My pixels: optionally a new picture (same
 * editors as when ordering), the title, link and name, then "Send for
 * approval". The content on the wall stays until the change is approved.
 */
export function EditRental({
  initialOrder,
  current,
  config,
  editable,
  rejected,
  admin = false,
}: {
  initialOrder: OrderResponse;
  current: CurrentContent | null;
  config: RentConfig;
  editable: boolean;
  rejected: boolean;
  /** An admin changes the content on the renter's behalf: it goes on the wall at once. */
  admin?: boolean;
}) {
  const t = useTranslations("mine");
  const tr = useTranslations("rent");
  const locale = useAppLocale();
  const [order, setOrder] = useState(initialOrder);
  const draft = order.content?.status === "draft" ? order.content : null;
  const pending = order.content?.status === "pending" ? order.content : null;
  const base = pending ?? current;
  const [title, setTitle] = useState(draft?.title ?? base?.title ?? "");
  const [url, setUrl] = useState(draft?.url ?? base?.url ?? "");
  const [displayName, setDisplayName] = useState(draft?.displayName ?? base?.displayName ?? "");
  const [tab, setTab] = useState<Tab>("upload");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const width = order.rect.w * config.block_size_px;
  const height = order.rect.h * config.block_size_px;
  // Editors start from the picture being worked on, or the one on the wall.
  const editorOrder: OrderResponse = draft || pending || !current ? order : { ...order, content: { ...current, status: "approved" } };
  const back = admin ? `/admin/rentals/${initialOrder.no}` : localePath(locale, "/my-pixels");

  if (!editable) {
    return (
      <>
        <h1>
          {t("editTitle")} <span className="muted small">#{order.no}</span>
        </h1>
        <p className="notice">{t("notEditable")}</p>
        <p>
          <a href={back}>« {t("backToList")}</a>
        </p>
      </>
    );
  }

  const submit = async () => {
    setBusy(true);
    setFailure(null);
    setErrors({});
    try {
      await api(admin ? `/api/admin/rentals/${order.id}` : `/api/my/rentals/${order.id}`, {
        method: "POST",
        body: JSON.stringify({ action: admin ? "publish" : "submit", contentId: draft?.id ?? null, title, url, displayName }),
      });
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid_details") setErrors((e.body.errors ?? {}) as Partial<Record<Field, string>>);
      else setFailure(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <>
        <h1>
          {t("editTitle")} <span className="muted small">#{order.no}</span>
        </h1>
        <div className="notice" role="status">
          <p>
            <b>{admin ? t("published") : t("sentTitle")}</b>
          </p>
          {!admin && <p>{current && !rejected ? t("sentKeep", { hours: config.reviewHours }) : t("sentNew", { hours: config.reviewHours })}</p>}
        </div>
        <p>
          <a href={back}>« {t("backToList")}</a>
        </p>
      </>
    );
  }

  const err = (f: Field) =>
    errors[f] ? (
      <span className="field-error" id={`err-${f}`}>
        {tr(`detailErrors.${errors[f]}` as "detailErrors.titleRequired")}
      </span>
    ) : null;
  const described = (f: Field) => (errors[f] ? { "aria-invalid": true, "aria-describedby": `err-${f}` } : {});
  const tabs: Tab[] = ["upload", "draw", "text"];

  return (
    <div className="edit-rental">
      {!admin && (
        <>
          <h1>
            {t("editTitle")} <span className="muted small">#{order.no}</span>
          </h1>
          <p>
            <a href={back}>« {t("backToList")}</a>
          </p>
          <p>{rejected ? t("editRejectedIntro") : t("editIntro")}</p>
        </>
      )}

      {current && (
        <div className="rent-current">
          <h3>{rejected ? t("lastVersion") : t("onWallNow")}</h3>
          <Preview src={`/api/rentals/${order.id}/content/${current.id}`} width={width} height={height} />
        </div>
      )}
      {pending && (
        <div className="rent-current">
          <h3>{t("waitingApproval")}</h3>
          <Preview src={`/api/rentals/${order.id}/content/${pending.id}?v=${pending.id}`} width={width} height={height} />
        </div>
      )}
      {draft && (
        <div className="rent-current">
          <h3>{t("newPicture")}</h3>
          <Preview src={`/api/rentals/${order.id}/content/${draft.id}?v=${draft.id}`} width={width} height={height} />
        </div>
      )}

      <h2>{t("pictureTitle", { w: width, h: height })}</h2>
      <p className="muted">{rejected ? t("pictureHelpRejected") : t("pictureHelp")}</p>
      <div className="tabs" role="tablist" aria-label={tr("contentKinds")}>
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} className="tab" onClick={() => setTab(k)}>
            {tr(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "upload" && <UploadEditor order={editorOrder} config={config} width={width} height={height} onSaved={setOrder} />}
        {tab === "draw" && <PixelEditor order={editorOrder} width={width} height={height} onSaved={setOrder} />}
        {tab === "text" && <TextEditor order={editorOrder} width={width} height={height} onSaved={setOrder} />}
      </div>

      <form
        className="rent-details"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2>{t("textsTitle")}</h2>
        <label className="field">
          {tr("fields.title")} <span className="muted small">{tr("fields.titleNote", { left: 80 - [...title].length })}</span>
          <input type="text" maxLength={80} required value={title} onChange={(e) => setTitle(e.target.value)} {...described("title")} />
          {err("title")}
        </label>
        <label className="field">
          {tr("fields.url")} <span className="muted small">{tr("fields.optional")}</span>
          <input type="text" inputMode="url" placeholder="https://" maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} {...described("url")} />
          {err("url")}
        </label>
        <label className="field">
          {tr("fields.displayName")} <span className="muted small">{tr("fields.optional")}</span>
          <input type="text" maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} {...described("displayName")} />
          {err("displayName")}
        </label>
        {failure && (
          <p className="error" role="alert">
            {t.has(`errors.${failure}`) ? t(`errors.${failure}` as "errors.error") : t("errors.error")}
          </p>
        )}
        <p>
          <button type="submit" className="btn btn-rent" disabled={busy}>
            {busy ? tr("saving") : admin ? t("publish") : t("submit")}
          </button>
        </p>
        {!admin && <p className="muted small">{t("submitNote", { hours: config.reviewHours })}</p>}
      </form>
    </div>
  );
}
