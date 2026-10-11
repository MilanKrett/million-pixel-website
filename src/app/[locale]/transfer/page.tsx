import type { Metadata } from "next";
import { TransferAccept } from "@/components/account/TransferAccept";
import { getTranslator } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("transfer.title"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function TransferPage() {
  const t = await getTranslator();
  return (
    <div className="content">
      <h1>{t("transfer.title")}</h1>
      <TransferAccept />
    </div>
  );
}
