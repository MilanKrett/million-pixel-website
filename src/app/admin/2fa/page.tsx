import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MfaVerify } from "@/components/admin/MfaForms";
import { I18nProvider } from "@/i18n/provider";
import { adminT } from "@/lib/admin/t";
import { requireStaffLogin } from "@/lib/auth/current";
import { safeNextPath } from "@/lib/auth/login";

export const instant = false;

export default function MfaPage({ searchParams }: PageProps<"/admin/2fa">) {
  return (
    <Suspense fallback={<p>…</p>}>
      <Verify searchParams={searchParams} />
    </Suspense>
  );
}

async function Verify({ searchParams }: { searchParams: PageProps<"/admin/2fa">["searchParams"] }) {
  const [session, params] = await Promise.all([requireStaffLogin("/admin/2fa"), searchParams]);
  if (!session.user.totp_enabled_at) redirect("/admin/2fa/setup");
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const t = adminT(session.user.locale);
  return (
    <I18nProvider locale={session.user.locale}>
      <div className="content">
        <h1>{t("mfa.verifyTitle")}</h1>
        <p>{t("mfa.verifyIntro", { email: session.user.email })}</p>
        <MfaVerify next={next?.startsWith("/admin") ? next : "/admin"} />
      </div>
    </I18nProvider>
  );
}
