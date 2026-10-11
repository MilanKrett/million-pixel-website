import type { Metadata } from "next";
import { ThanksView } from "@/components/rent/ThanksView";
import { getTranslator } from "@/i18n/server";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("thanks.title"), robots: { index: false } };
}

export default function ThanksPage() {
  const devEmails = isDevPaymentsAllowed() && (process.env.EMAIL_DRIVER ?? "log") === "log";
  return <ThanksView devEmails={devEmails} />;
}
