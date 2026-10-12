import type { Metadata } from "next";
import { Suspense } from "react";
import { Wall } from "@/components/wall/Wall";
import { WallPlaceholder } from "@/components/wall/WallPlaceholder";
import { getLocale } from "@/i18n/server";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";
import { alternates } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  // Title, description and the wall picture for social networks come from the
  // layout (a page that sets openGraph would replace all of it).
  return { alternates: alternates(await getLocale(), "/") };
}

export default function HomePage() {
  return (
    <Suspense fallback={<WallPlaceholder />}>
      <WallSection />
    </Suspense>
  );
}

async function WallSection() {
  const [settings, snapshot] = await Promise.all([getSiteSettings(), getWallSnapshot()]);
  const blockPixels = settings.block_size_px * settings.block_size_px;
  return (
    <Wall
      initial={snapshot}
      blockPriceCents={Math.round(blockPixels * settings.price_cents_per_pixel)}
      currency={settings.currency}
      directLinkOpen={settings.direct_link_open}
    />
  );
}
