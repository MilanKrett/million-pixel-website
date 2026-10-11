import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExtendForm } from "@/components/account/ExtendForm";
import { WallCrop } from "@/components/wall/WallCrop";
import { ClientMessages } from "@/i18n/client-messages";
import { localePath } from "@/i18n/config";
import { getFormatter, getLocale, getTranslator } from "@/i18n/server";
import { getSession } from "@/lib/auth/current";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";
import { db } from "@/lib/db";
import { pixelRange } from "@/lib/geometry";
import { extensionKeyMatches, loadExtension } from "@/lib/orders/extension";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  // The address carries the key from the e-mail: keep it out of referrers and search engines.
  return { title: t("extend.title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Extend a rental: from the link in the reminder e-mail, or from My pixels. */
export default async function ExtendPage({ params, searchParams }: PageProps<"/[locale]/extend/[no]">) {
  const t = await getTranslator();
  return (
    <div className="content">
      <h1>{t("extend.title")}</h1>
      <Suspense fallback={<p>…</p>}>
        <ExtendSection params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ExtendSection({
  params,
  searchParams,
}: {
  params: PageProps<"/[locale]/extend/[no]">["params"];
  searchParams: PageProps<"/[locale]/extend/[no]">["searchParams"];
}) {
  const [{ no }, query, session, locale, settings, snapshot, t, format] = await Promise.all([
    params,
    searchParams,
    getSession(),
    getLocale(),
    getSiteSettings(),
    getWallSnapshot(),
    getTranslator(),
    getFormatter(),
  ]);
  const state = await loadExtension(db(), settings, Number(no));
  if (!state) notFound();
  const key = typeof query.k === "string" ? query.k : null;
  const keyOk = extensionKeyMatches(state.id, key);
  if (!keyOk && session?.user.id !== state.userId) {
    const back = localePath(locale, `/extend/${state.no}`);
    return (
      <>
        <p>{t("extend.invalidLink")}</p>
        <p>
          <a className="btn" href={`${localePath(locale, "/login")}?next=${encodeURIComponent(back)}`}>
            {t("extend.signIn")}
          </a>
        </p>
      </>
    );
  }

  const block = settings.block_size_px;
  const range = pixelRange(state.rect, block);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "long" });
  const justPaid = query.paid === "1";
  const paidRecently = state.lastPaid !== null && Date.now() - state.lastPaid.paidAt.getTime() < 2 * 3600_000;
  const { x, y, w, h } = state.rect;

  return (
    <>
      <p>{t("extend.intro")}</p>
      <div className="extend-rental">
        <WallCrop
          image={snapshot.image?.webp ?? null}
          wallWidth={settings.wall_width_px}
          wallHeight={settings.wall_height_px}
          block={block}
          rect={state.rect}
          label={state.title ?? ""}
        />
        <div>
          <p>
            <b>{state.title ?? "—"}</b> <span className="muted small">{t("extend.rental", { no: state.no })}</span>
          </p>
          <p className="small">
            {t("mine.positionValue", { x0: range.x0, x1: range.x1, y0: range.y0, y1: range.y1 })} ·{" "}
            {t("mine.sizeValue", { w: w * block, h: h * block, pixels: w * block * h * block })}
          </p>
          {state.endsAt && (
            <p>
              {state.status === "grace" && state.graceEndsAt
                ? t("extend.inGrace", { date: date(state.endsAt), until: date(state.graceEndsAt) })
                : t("extend.validUntil", { date: date(state.endsAt) })}
            </p>
          )}
        </div>
      </div>

      {justPaid &&
        (paidRecently && state.endsAt ? (
          <div className="notice" role="status">
            <p>
              <b>{t("extend.paidTitle")}</b> {t("extend.paid", { date: date(state.endsAt) })}
            </p>
          </div>
        ) : (
          <p className="notice" role="status">
            {t("extend.processing")}
          </p>
        ))}

      {state.blocked ? (
        <>
          <p className="warning">{t(`extend.blocked.${state.blocked}`)}</p>
          {state.blocked === "not_extendable" && ["ended", "expired", "refunded", "removed"].includes(state.status) && (
            <p>
              <a href={`${localePath(locale, "/rent")}?x=${x}&y=${y}&w=${w}&h=${h}`}>{t("extend.rentAgain")}</a>
            </p>
          )}
        </>
      ) : (
        <ClientMessages namespaces={["extend"]}>
          <ExtendForm
            no={state.no}
            extKey={keyOk ? key : null}
            currency={settings.currency}
            options={state.options.map((o) => ({ ...o, endsAt: o.endsAt.toISOString() }))}
          />
        </ClientMessages>
      )}
    </>
  );
}
