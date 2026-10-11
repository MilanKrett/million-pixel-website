import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/account/LoginForm";
import { MyPixels } from "@/components/account/MyPixels";
import { ClientMessages } from "@/i18n/client-messages";
import { localePath } from "@/i18n/config";
import { getLocale, getTranslator } from "@/i18n/server";
import { listMyRentals } from "@/lib/account/my-rentals";
import { getSession } from "@/lib/auth/current";
import { getSiteSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { turnstileSiteKey } from "@/lib/turnstile";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("pages.mine"), robots: { index: false } };
}

export default async function MyPixelsPage() {
  const t = await getTranslator();
  return (
    <div className="content wide">
      <h1>{t("pages.mine")}</h1>
      <Suspense fallback={<p>…</p>}>
        <MySection />
      </Suspense>
    </div>
  );
}

async function MySection() {
  const [session, locale, settings, t] = await Promise.all([getSession(), getLocale(), getSiteSettings(), getTranslator()]);
  if (!session) {
    const devEmails = isDevPaymentsAllowed() && (process.env.EMAIL_DRIVER ?? "log") === "log";
    return (
      <>
        <p>{t("mine.signInIntro")}</p>
        <ClientMessages namespaces={["login"]}>
          <LoginForm next={localePath(locale, "/my-pixels")} minutes={settings.magic_link_minutes} siteKey={turnstileSiteKey()} devEmails={devEmails} />
        </ClientMessages>
      </>
    );
  }
  const rentals = await listMyRentals(db(), session.user.id);
  return (
    <ClientMessages namespaces={["mine", "reasons"]}>
      <MyPixels
        rentals={rentals}
        email={session.user.email}
        blockSize={settings.block_size_px}
        currency={settings.currency}
        transferDays={settings.transfer_days}
        siteUrl={process.env.SITE_URL ?? "http://localhost:3000"}
      />
    </ClientMessages>
  );
}
