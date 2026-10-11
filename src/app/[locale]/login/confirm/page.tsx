import type { Metadata } from "next";
import { LoginConfirm } from "@/components/account/LoginConfirm";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("login.title"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function LoginConfirmPage() {
  const t = await getTranslator();
  return (
    <div className="content">
      <h1>{t("login.title")}</h1>
      <LoginConfirm />
    </div>
  );
}
