"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "use-intl/react";
import { localePath } from "@/i18n/config";
import { useAppLocale } from "@/i18n/provider";
import { api, type OrderResponse } from "./shared";

/** Step 7: after the payment page. Shows what happens next. */
export function ThanksView({ devEmails }: { devEmails: boolean }) {
  const t = useTranslations("thanks");
  const locale = useAppLocale();
  const [state, setState] = useState<{ order: OrderResponse | null; refunded: boolean } | null>(null);

  useEffect(() => {
    const refunded = new URLSearchParams(window.location.search).get("refunded") === "1";
    api<{ order: OrderResponse | null }>("/api/order")
      .then(({ order }) => setState({ order, refunded }))
      .catch(() => setState({ order: null, refunded }));
  }, []);

  if (!state) {
    return (
      <div className="content">
        <h1>{t("title")}</h1>
        <p>…</p>
      </div>
    );
  }

  const { order, refunded } = state;
  const wall = localePath(locale, "/");
  return (
    <div className="content">
      {refunded ? (
        <>
          <h1>{t("refundedTitle")}</h1>
          <p>{t("refundedText")}</p>
          <p>
            <a className="btn btn-rent" href={localePath(locale, "/buy")}>
              {t("chooseAnother")}
            </a>
          </p>
        </>
      ) : order && (order.status === "in_review" || order.status === "active") ? (
        <>
          <h1>{t("title")}</h1>
          <div className="notice">
            <p>
              <b>{order.status === "active" ? t("statusActive") : t("statusReview")}</b>
            </p>
            {order.status !== "active" && <p>{t("reviewText")}</p>}
          </div>
          <p>{t("emailSent", { email: order.email ?? "" })}</p>
          <p>
            <a href={`${wall}?x=${order.rect.x}&y=${order.rect.y}&zoom=4`}>{t("seeSpot")}</a>
          </p>
        </>
      ) : order && (order.status === "hold" || order.status === "awaiting_payment") ? (
        <>
          <h1>{t("notPaidTitle")}</h1>
          <p>{t("notPaidText")}</p>
          <p>
            <a className="btn" href={localePath(locale, "/buy")}>
              {t("backToOrder")}
            </a>
          </p>
        </>
      ) : (
        <>
          <h1>{t("noOrderTitle")}</h1>
          <p>{t("noOrderText")}</p>
        </>
      )}
      {devEmails && (
        <p className="notice small">
          {t("devEmails")} <a href={localePath(locale, "/dev/emails")}>/dev/emails</a>
        </p>
      )}
      <p>
        <a href={wall}>« {t("backToWall")}</a>
      </p>
    </div>
  );
}
