import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmailTextEditor } from "@/components/admin/EmailTextEditor";
import { isLocale, type Locale } from "@/i18n/config";
import { emailTextDefaults } from "@/lib/admin/manage";
import { adminT } from "@/lib/admin/t";
import { requireStaffPage } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { loadEmailEnv } from "@/lib/email/env";
import { EMAIL_TEMPLATES, sampleEmail, SHARED_EMAIL_KEYS, type EmailTemplate } from "@/lib/email/templates";

export const instant = false;

export default function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Emails searchParams={searchParams} />
    </Suspense>
  );
}

/** Keys of one template (its own group plus texts it borrows), or the shared ones for "common". */
function keysFor(template: EmailTemplate | "common", defaults: Record<string, string>): string[] {
  const all = Object.keys(defaults);
  if (template === "common") return all.filter((k) => !EMAIL_TEMPLATES.some((tpl) => k.startsWith(`${tpl}.`)));
  return [...all.filter((k) => k.startsWith(`${template}.`)), ...(SHARED_EMAIL_KEYS[template] ?? [])];
}

async function Emails({ searchParams }: { searchParams: PageProps<"/admin/emails">["searchParams"] }) {
  const session = await requireStaffPage("admin", "/admin/emails");
  const params = await searchParams;
  const template = (EMAIL_TEMPLATES as readonly string[]).includes(String(params.t)) ? (params.t as EmailTemplate) : params.t === "common" ? "common" : "paid";
  const locale: Locale = isLocale(params.l) ? params.l : session.user.locale;
  const t = adminT(session.user.locale);
  const env = await loadEmailEnv(db());
  const defaults = emailTextDefaults(locale);
  const keys = keysFor(template, defaults);
  const preview = sampleEmail(env, template === "common" ? "paid" : template, locale);
  const link = (tpl: string, l: Locale) => `/admin/emails?t=${tpl}&l=${l}`;

  return (
    <AdminShell session={session} active="emails">
      <h1>{t("emails.title")}</h1>
      <p>{t("emails.intro")}</p>
      <p className="admin-tabs">
        {[...EMAIL_TEMPLATES, "common" as const].map((tpl, i) => (
          <span key={tpl}>
            {i > 0 && " | "}
            {tpl === template ? <b>{t(`emails.templates.${tpl}`)}</b> : <a href={link(tpl, locale)}>{t(`emails.templates.${tpl}`)}</a>}
          </span>
        ))}
      </p>
      <p>
        {t("emails.language")}{" "}
        {(["sk", "en"] as const).map((l, i) => (
          <span key={l}>
            {i > 0 && " | "}
            {l === locale ? <b>{l.toUpperCase()}</b> : <a href={link(template, l)}>{l.toUpperCase()}</a>}
          </span>
        ))}
      </p>
      <div className="admin-email">
        <EmailTextEditor
          locale={locale}
          fields={keys.map((key) => ({ key, original: defaults[key]!, value: env.texts?.[locale]?.[key] ?? null }))}
        />
        <div>
          <h2>{t("emails.preview")}</h2>
          <p className="small">
            <b>{t("emails.subject")}</b> {preview.subject}
          </p>
          <iframe className="email-preview" sandbox="" srcDoc={preview.html} title={preview.subject} />
          <details className="small">
            <summary>{t("emails.plainText")}</summary>
            <pre className="pre-wrap">{preview.text}</pre>
          </details>
        </div>
      </div>
    </AdminShell>
  );
}
