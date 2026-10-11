import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/account/LoginForm";
import { localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { getSession } from "@/lib/auth/current";
import { safeNextPath } from "@/lib/auth/login";
import { getSiteSettings } from "@/lib/data";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { turnstileSiteKey } from "@/lib/turnstile";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("login.title"), robots: { index: false } };
}

export default async function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const t = await getTranslator();
  return (
    <div className="content">
      <h1>{t("login.title")}</h1>
      <p>{t("login.intro")}</p>
      <Suspense fallback={<p>…</p>}>
        <LoginSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginSection({ searchParams }: { searchParams: PageProps<"/[locale]/login">["searchParams"] }) {
  const [params, session, locale, settings] = await Promise.all([searchParams, getSession(), getLocale(), getSiteSettings()]);
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  // Already signed in: go on.
  if (session) redirect(next ?? localePath(locale, "/my-pixels"));
  const devEmails = isDevPaymentsAllowed() && (process.env.EMAIL_DRIVER ?? "log") === "log";
  return <LoginForm next={next} minutes={settings.magic_link_minutes} siteKey={turnstileSiteKey()} devEmails={devEmails} />;
}
