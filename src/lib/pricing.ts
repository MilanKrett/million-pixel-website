import type { Settings } from "@/lib/settings/schema";

export type PricingSettings = Pick<
  Settings,
  "price_cents_per_pixel_year" | "block_size_px" | "periods" | "vat_payer" | "vat_rate_pct" | "currency"
>;

export interface Quote {
  /** Size in blocks and pixels. */
  blocks: number;
  pixels: number;
  years: number;
  discountPct: number;
  /** Price for one year without discount. */
  perYearCents: number;
  /** perYearCents × years. */
  subtotalCents: number;
  discountCents: number;
  /** What the buyer pays (final price, VAT included when the operator is a VAT payer). */
  totalCents: number;
  /** VAT contained in totalCents (0 when not a VAT payer). */
  vatCents: number;
  currency: string;
}

/**
 * The price of a rental: pixels × price per pixel × years × (1 − discount).
 * Only the server's result counts; browsers call this just to show an estimate.
 * Returns null for a period that is not offered.
 */
export function quote(settings: PricingSettings, wBlocks: number, hBlocks: number, years: number): Quote | null {
  const period = settings.periods.find((p) => p.years === years);
  if (!period || !Number.isInteger(wBlocks) || !Number.isInteger(hBlocks) || wBlocks < 1 || hBlocks < 1) return null;
  const blocks = wBlocks * hBlocks;
  const pixels = blocks * settings.block_size_px * settings.block_size_px;
  const perYearCents = Math.round(pixels * settings.price_cents_per_pixel_year);
  const subtotalCents = perYearCents * years;
  const totalCents = Math.round(subtotalCents * (1 - period.discount_pct / 100));
  const vatCents = settings.vat_payer
    ? Math.round((totalCents * settings.vat_rate_pct) / (100 + settings.vat_rate_pct))
    : 0;
  return {
    blocks,
    pixels,
    years,
    discountPct: period.discount_pct,
    perYearCents,
    subtotalCents,
    discountCents: subtotalCents - totalCents,
    totalCents,
    vatCents,
    currency: settings.currency,
  };
}
