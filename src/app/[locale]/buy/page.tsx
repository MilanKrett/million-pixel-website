import { Suspense } from "react";
import { RentWizard } from "@/components/rent/RentWizard";
import { WallPlaceholder } from "@/components/wall/WallPlaceholder";
import { ClientMessages } from "@/i18n/client-messages";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";
import { rentConfig } from "@/lib/rent-config";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata("buy", "/buy");

export default function BuyPage() {
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
