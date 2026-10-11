"use client";

import { useTranslations } from "use-intl/react";
import type { AutoChecks } from "@/lib/moderation/checks";

/** Results of the automatic checks, warnings first and in red. */
export function ChecksSummary({ checks }: { checks: Partial<AutoChecks> | null }) {
  const t = useTranslations("admin.checks");
  if (!checks?.checkedAt) return <span className="muted">{t("notYet")}</span>;
  const image = checks.image;
  const link = checks.link;
  const text = checks.text?.flagged ?? [];
  const high = Object.entries(image?.scores ?? {})
    .filter(([, v]) => v >= 0.3)
    .sort((a, b) => b[1] - a[1]);
  return (
    <ul className="checks">
      <li className={image?.status === "flagged" ? "error" : undefined}>
        {t("image")}: {t(`status.${image?.status ?? "skipped"}` as "status.ok")}
        {image?.provider && image.provider !== "none" && <span className="muted"> ({image.provider})</span>}
        {high.length > 0 && <span> — {high.map(([k, v]) => `${k} ${Math.round(v * 100)} %`).join(", ")}</span>}
      </li>
      <li className={link?.status === "flagged" ? "error" : undefined}>
        {t("link")}: {t(`status.${link?.status ?? "none"}` as "status.ok")}
        {link?.reputation?.threats?.length ? <span> — {link.reputation.threats.join(", ")}</span> : null}
        {link?.redirects && link.redirects.length > 1 && (
          <span className="muted small break">
            {" "}
            {t("redirects")} {link.finalUrl}
          </span>
        )}
        {link?.error && <span className="muted small"> ({link.error})</span>}
      </li>
      <li className={text.length ? "error" : undefined}>
        {t("text")}: {text.length ? t("textFlagged", { words: text.join(", ") }) : t("status.ok")}
      </li>
      <li className="muted small">{t("csam")}</li>
    </ul>
  );
}
