import type { Metadata } from "next";
import { ThanksView } from "@/components/rent/ThanksView";
import { ClientMessages } from "@/i18n/client-messages";
import { getTranslator } from "@/i18n/server";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("thanks.title"), robots: { index: false } };
}

export default function ThanksPage() {
  const devEmails = isDevPaymentsAllowed() && (process.env.EMAIL_DRIVER ?? "log") === "log";
  return (
    <ClientMessages namespaces={["thanks"]}>
      <ThanksView devEmails={devEmails} />
    </ClientMessages>
  );
}
