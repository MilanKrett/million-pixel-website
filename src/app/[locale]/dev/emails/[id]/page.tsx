import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { db } from "@/lib/db";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";

export const metadata: Metadata = { title: "E-mail (development)", robots: { index: false } };
export const instant = false;

export default function DevEmailPage({ params }: PageProps<"/[locale]/dev/emails/[id]">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Email params={params} />
    </Suspense>
  );
}

async function Email({ params }: { params: PageProps<"/[locale]/dev/emails/[id]">["params"] }) {
  if (!isDevPaymentsAllowed()) notFound();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isSafeInteger(n)) notFound();
  const locale = await getLocale();
  const t = await getTranslator(locale);
  const [mail] = await db()<{ to_email: string; subject: string; html: string; text_body: string }[]>`
    select to_email, subject, html, text_body from email_log where id = ${n}
  `;
  if (!mail) notFound();
  return (
    <div className="content wide">
      <p>
        <a href={localePath(locale, "/dev/emails")}>« {t("devEmails.title")}</a>
      </p>
      <h1>{mail.subject}</h1>
      <p>
        {t("devEmails.to")}: {mail.to_email}
      </p>
      {/* An empty sandbox: the e-mail can neither run scripts nor reach this page. */}
      <iframe className="email-frame" title={mail.subject} srcDoc={mail.html} sandbox="" />
      <details>
        <summary>{t("devEmails.plain")}</summary>
        <pre className="email-text">{mail.text_body}</pre>
      </details>
    </div>
  );
}
