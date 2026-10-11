import type { Metadata } from "next";
import { Suspense } from "react";
import { RentWizard } from "@/components/rent/RentWizard";
import { WallPlaceholder } from "@/components/wall/WallPlaceholder";
import { ClientMessages } from "@/i18n/client-messages";
import { getTranslator } from "@/i18n/server";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";
import { rentConfig } from "@/lib/rent-config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("pages.rent") };
}

export default function RentPage() {
  return (
    <Suspense fallback={<WallPlaceholder />}>
      <RentSection />
    </Suspense>
  );
}

async function RentSection() {
  const [settings, snapshot] = await Promise.all([getSiteSettings(), getWallSnapshot()]);
  return (
    <ClientMessages namespaces={["rent"]}>
      <RentWizard initial={snapshot} config={rentConfig(settings)} />
    </ClientMessages>
  );
}
