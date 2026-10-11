import type { Metadata } from "next";
import { Suspense } from "react";
import { RentWizard } from "@/components/rent/RentWizard";
import type { RentConfig } from "@/components/rent/shared";
import { WallPlaceholder } from "@/components/wall/WallPlaceholder";
import { getTranslator } from "@/i18n/server";
import { getSiteSettings, getWallSnapshot } from "@/lib/data";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { wallGrid } from "@/lib/settings/schema";

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
  const grid = wallGrid(settings);
  const devMode = isDevPaymentsAllowed();
  const config: RentConfig = {
    price_cents_per_pixel_year: settings.price_cents_per_pixel_year,
    block_size_px: settings.block_size_px,
    periods: settings.periods,
    vat_payer: settings.vat_payer,
    vat_rate_pct: settings.vat_rate_pct,
    currency: settings.currency,
    cols: grid.cols,
    rows: grid.rows,
    minBlocks: settings.min_blocks,
    maxBlocks: settings.max_blocks,
    holdMinutes: settings.hold_minutes,
    uploadMaxMb: settings.upload_max_mb,
    uploadMaxPx: settings.upload_max_px,
    uploadFormats: settings.upload_formats,
    salesPaused: settings.sales_paused,
    reviewHours: settings.review_hours,
    devPayments: devMode && (process.env.PAYMENT_PROVIDER ?? "dev") === "dev",
    devEmails: devMode && (process.env.EMAIL_DRIVER ?? "log") === "log",
  };
  return <RentWizard initial={snapshot} config={config} />;
}
