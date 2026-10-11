"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "use-intl/react";
import { api, ApiError } from "@/components/rent/shared";
import { intlLocale, localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import type { MyRental } from "@/lib/account/my-rentals";
import { pixelRange } from "@/lib/geometry";
import { formatMoney } from "@/lib/money";
import { displayDomain } from "@/lib/url";

const EDITABLE = ["in_review", "active", "grace", "rejected"];
const TRANSFERABLE = ["in_review", "active", "grace"];

/** "My pixels": the signed-in renter's rentals and what they can do with them. */
export function MyPixels({
  rentals,
  email,
  blockSize,
  currency,
  transferDays,
  siteUrl,
}: {
  rentals: MyRental[];
  email: string;
  blockSize: number;
  currency: string;
  transferDays: number;
  siteUrl: string;
}) {
  const t = useTranslations("mine");
  const locale = useAppLocale();

  return (
    <div className="mine">
      <form className="mine-account-bar" method="post" action="/api/auth/logout">
        <span>{t.rich("signedInAs", { email, b: (c) => <b>{c}</b> })}</span>{" "}
        <input type="hidden" name="next" value={localePath(locale, "/")} />
        <button type="submit" className="link-button">
          {t("logout")}
        </button>
      </form>

      {rentals.length === 0 ? (
        <div className="notice">
          <p>{t("empty")}</p>
          <p>
            <a href={localePath(locale, "/buy")}>{t("rentNow")}</a>
          </p>
        </div>
      ) : (
        rentals.map((r) => (
          <RentalCard key={r.id} rental={r} blockSize={blockSize} currency={currency} transferDays={transferDays} siteUrl={siteUrl} />
        ))
      )}

      <DeleteAccount email={email} />
    </div>
  );
}

function RentalCard({
  rental: r,
  blockSize,
  currency,
  transferDays,
  siteUrl,
}: {
  rental: MyRental;
  blockSize: number;
  currency: string;
  transferDays: number;
  siteUrl: string;
}) {
  const t = useTranslations("mine");
  const tr = useTranslations("reasons");
  const format = useFormatter();
  const locale = useAppLocale();
  const [copied, setCopied] = useState(false);
  const w = r.rect.w * blockSize;
  const h = r.rect.h * blockSize;
  const range = pixelRange(r.rect, blockSize);
  const scale = Math.max(1, Math.min(4, Math.floor(200 / Math.max(w, h))));
  const content = r.current ?? r.pending ?? r.declined;
  const spotPath = `${localePath(locale, "/")}?x=${r.rect.x}&y=${r.rect.y}&zoom=4`;
  // The share page shows a picture of the place on social networks and then opens the wall there.
  const sharePath = localePath(locale, `/p/${r.no}`);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });
  const money = (cents: number) => formatMoney(cents, currency, intlLocale(locale));

  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${siteUrl}${sharePath}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t("share"), `${siteUrl}${sharePath}`);
    }
  };

  return (
    <section className="mine-card" aria-labelledby={`r-${r.no}`}>
      <div className="mine-preview">
        {content && (
          // eslint-disable-next-line @next/next/no-img-element -- exact pixels of the content
          <img
            src={`/api/rentals/${r.id}/content/${content.id}`}
            width={w * scale}
            height={h * scale}
            alt={content.title ?? ""}
            className="preview-zoom"
          />
        )}
      </div>
      <div className="mine-body">
        <h2 id={`r-${r.no}`}>
          {content?.title ?? "—"} <span className="muted small">#{r.no}</span>
        </h2>
        <p>
          <b className={`status status-${r.status}`}>{t(`status.${r.status}` as "status.active")}</b>
          {r.hidden && <span className="muted"> · {t("hidden")}</span>}
        </p>
        <table className="data">
          <tbody>
            <tr>
              <th scope="row">{t("position")}</th>
              <td>
                <a href={spotPath}>{t("positionValue", { x0: range.x0, x1: range.x1, y0: range.y0, y1: range.y1 })}</a>
              </td>
            </tr>
            <tr>
              <th scope="row">{t("size")}</th>
              <td>{t("sizeValue", { w, h, pixels: w * h })}</td>
            </tr>
            <tr>
              <th scope="row">{t("since")}</th>
              <td>{r.startsAt ? date(r.startsAt) : r.status === "in_review" || r.status === "rejected" ? t("afterApproval") : "—"}</td>
            </tr>
            {content?.url && (
              <tr>
                <th scope="row">{t("link")}</th>
                <td>{displayDomain(content.url)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {r.pending && r.current && (
          <p className="notice small">{t("waitingChange", { date: r.pending.submittedAt ? date(r.pending.submittedAt) : "" })}</p>
        )}
        {r.decision && (
          <div className="warning">
            <p>
              <b>{t(r.decision.status === "changes_requested" ? "decision.changes" : r.current ? "decision.changeRejected" : "decision.rejected")}</b>
            </p>
            {r.decision.reasonCode && tr.has(r.decision.reasonCode as "other") && (
              <p>{t("reason", { reason: tr(r.decision.reasonCode as "other") })}</p>
            )}
            {r.decision.note && <p className="quote">{r.decision.note}</p>}
            {r.status === "rejected" && r.reuploadUntil && <p>{t("reuploadUntil", { date: date(r.reuploadUntil) })}</p>}
          </div>
        )}

        <p className="mine-actions">
          {EDITABLE.includes(r.status) && (
            <a className="btn" href={localePath(locale, `/my-pixels/${r.no}`)}>
              {r.status === "rejected" ? t("sendNew") : t("change")}
            </a>
          )}{" "}
          {r.status === "active" || r.status === "grace" ? (
            <button type="button" className="btn" onClick={share}>
              {copied ? t("copied") : t("share")}
            </button>
          ) : null}
        </p>

        <p className="small">
          {t("stats", { clicks: r.stats.clicks, opens: r.stats.opens })}
        </p>
        {r.stats.days.length > 0 && (
          <details className="small">
            <summary>{t("statsDays")}</summary>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t("day")}</th>
                  <th scope="col">{t("clicks")}</th>
                  <th scope="col">{t("opens")}</th>
                </tr>
              </thead>
              <tbody>
                {r.stats.days.map((d) => (
                  <tr key={d.day}>
                    <td>{format.dateTime(new Date(`${d.day}T12:00:00Z`), { dateStyle: "medium" })}</td>
                    <td>{d.clicks}</td>
                    <td>{d.opens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}

        {r.payments.length > 0 && (
          <p className="small">
            {t("receipts")}{" "}
            {r.payments.map((p, i) => (
              <span key={p.id}>
                {i > 0 && " | "}
                <a href={localePath(locale, `/my-pixels/receipt/${p.id}`)}>
                  {p.invoiceNumber ?? "—"} ({money(p.amountCents)})
                </a>
                {p.refundedCents > 0 && <span className="muted"> {t("refundedAmount", { amount: money(p.refundedCents) })}</span>}
              </span>
            ))}
          </p>
        )}

        {TRANSFERABLE.includes(r.status) && <Transfer rental={r} transferDays={transferDays} />}
      </div>
    </section>
  );
}

function Transfer({ rental, transferDays }: { rental: MyRental; transferDays: number }) {
  const t = useTranslations("mine");
  const format = useFormatter();
  const locale = useAppLocale();
  const [pending, setPending] = useState(rental.transfer);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/my/rentals/${rental.id}`, { method: "POST", body: JSON.stringify({ action: "transfer", email, locale }) });
      setPending({ toEmail: email.trim().toLowerCase(), expiresAt: new Date(Date.now() + transferDays * 86400_000).toISOString() });
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/api/my/rentals/${rental.id}`, { method: "POST", body: JSON.stringify({ action: "cancelTransfer" }) });
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return (
      <p className="small notice">
        {t("transferPending", { email: pending.toEmail, date: format.dateTime(new Date(pending.expiresAt), { dateStyle: "medium" }) })}{" "}
        <button type="button" className="link-button" onClick={cancel} disabled={busy}>
          {t("transferCancel")}
        </button>
      </p>
    );
  }
  if (!open) {
    return (
      <p className="small">
        <button type="button" className="link-button" onClick={() => setOpen(true)}>
          {t("transferOpen")}
        </button>
      </p>
    );
  }
  return (
    <form
      className="mine-transfer small"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <p>{t("transferHelp", { days: transferDays })}</p>
      <label className="field">
        {t("transferEmail")}
        <input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      <p>
        <button type="submit" className="btn" disabled={busy}>
          {t("transferSend")}
        </button>{" "}
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          {t("cancel")}
        </button>
      </p>
    </form>
  );
}

function DeleteAccount({ email }: { email: string }) {
  const t = useTranslations("mine");
  const locale = useAppLocale();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/my/account", { method: "DELETE", body: JSON.stringify({ confirm }) });
      window.location.assign(localePath(locale, "/"));
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "network");
      setBusy(false);
    }
  };

  return (
    <details className="mine-delete">
      <summary>{t("deleteTitle")}</summary>
      <p>{t("deleteHelp")}</p>
      <label className="field">
        {t("deleteConfirm", { email })}
        <input type="email" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </label>
      {error && (
        <p className="error" role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.error") : t("errors.error")}
        </p>
      )}
      <p>
        <button type="button" className="btn" onClick={remove} disabled={busy || confirm.trim().toLowerCase() !== email}>
          {t("deleteButton")}
        </button>
      </p>
    </details>
  );
}
