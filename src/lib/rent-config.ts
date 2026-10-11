import "server-only";
import type { RentConfig } from "@/components/rent/shared";
import { isDevPaymentsAllowed } from "@/lib/payments/provider";
import { wallGrid, type Settings } from "@/lib/settings/schema";
import { turnstileSiteKey } from "@/lib/turnstile";

/** Settings the order flow and the content editors need in the browser. */
export function rentConfig(settings: Settings): RentConfig {
  const grid = wallGrid(settings);
  const devMode = isDevPaymentsAllowed();
  return {
    price_cents_per_pixel: settings.price_cents_per_pixel,
    block_size_px: settings.block_size_px,
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
    turnstileSiteKey: turnstileSiteKey(),
  };
}
