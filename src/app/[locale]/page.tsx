import type { Metadata } from "next";
import { Suspense } from "react";
import { Wall } from "@/components/wall/Wall";
import { WallPlaceholder } from "@/components/wall/WallPlaceholder";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";

export const metadata: Metadata = {
  alternates: { languages: { en: "/", sk: "/sk", "x-default": "/" } },
};

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
      blockPriceCents={Math.round(blockPixels * settings.price_cents_per_pixel_year)}
      currency={settings.currency}
      directLinkOpen={settings.direct_link_open}
    />
  );
}
