import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { intlLocale, localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { db } from "@/lib/db";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";

export const metadata: Metadata = { title: "E-mails (development)", robots: { index: false } };
export const instant = false;

/** Development mailbox: every e-mail the site would have sent (EMAIL_DRIVER=log). */
export default function DevEmailsPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <Mailbox />
    </Suspense>
  );
}

async function Mailbox() {
  await connection();
  if (!isDevPaymentsAllowed()) notFound();
  const locale = await getLocale();
  const t = await getTranslator(locale);
  const mails = await db()<{ id: number; to_email: string; subject: string; locale: string; created_at: Date }[]>`
    select id, to_email, subject, locale, created_at from email_log order by id desc limit 100
  `;
  const time = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Bratislava" });
  return (
    <div className="content wide">
      <h1>{t("devEmails.title")}</h1>
      <p className="notice">{t("devEmails.explain")}</p>
      {mails.length === 0 ? (
        <p>{t("devEmails.empty")}</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>{t("devEmails.time")}</th>
              <th>{t("devEmails.to")}</th>
              <th>{t("devEmails.subject")}</th>
              <th>{t("devEmails.language")}</th>
            </tr>
          </thead>
          <tbody>
            {mails.map((m) => (
              <tr key={m.id}>
                <td>{time.format(m.created_at)}</td>
                <td>{m.to_email}</td>
                <td>
                  <a href={localePath(locale, `/dev/emails/${m.id}`)}>{m.subject}</a>
                </td>
                <td>{m.locale.toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
