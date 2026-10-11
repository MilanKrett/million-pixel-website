import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { AdminI18n } from "@/components/admin/AdminI18n";
import { MfaSetup } from "@/components/admin/MfaForms";
import { adminT } from "@/lib/admin/t";
import { requireStaffLogin } from "@/lib/auth/current";
import { ensurePendingTotp } from "@/lib/auth/mfa";
import { otpauthUri } from "@/lib/auth/totp";
import { getSiteSettings } from "@/lib/data";
import { db } from "@/lib/db";

export const instant = false;

export default function MfaSetupPage() {
  return (
    <Suspense fallback={<p>…</p>}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  const session = await requireStaffLogin("/admin/2fa/setup");
  if (session.user.totp_enabled_at) redirect("/admin/2fa");
  const [secret, settings] = await Promise.all([ensurePendingTotp(db(), session.user), getSiteSettings()]);
  const uri = otpauthUri(secret, session.user.email, settings.site_name);
  const qr = await QRCode.toString(uri, { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "M" });
  const t = adminT(session.user.locale);
  return (
    <AdminI18n locale={session.user.locale}>
      <div className="content">
        <h1>{t("mfa.setupTitle")}</h1>
        <p>{t("mfa.setupIntro")}</p>
        <ol>
          <li>{t("mfa.step1")}</li>
          <li>{t("mfa.step2")}</li>
          <li>{t("mfa.step3")}</li>
        </ol>
        {/* The QR code is generated on the server from our own data (no user input in the SVG). */}
        <div className="mfa-qr" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="small">
          {t("mfa.manual")} <code className="mfa-secret">{secret.replace(/(.{4})/g, "$1 ").trim()}</code>
        </p>
        <MfaSetup />
      </div>
    </AdminI18n>
  );
}
