import type { Settings } from "@/lib/settings/schema";

export type PricingSettings = Pick<Settings, "price_cents_per_pixel" | "block_size_px" | "vat_payer" | "vat_rate_pct" | "currency">;

export interface Quote {
  /** Size in blocks and pixels. */
  blocks: number;
  pixels: number;
  pricePerPixelCents: number;
  /** What the buyer pays, once (final price, VAT included when the operator is a VAT payer). */
  totalCents: number;
  /** VAT contained in totalCents (0 when not a VAT payer). */
  vatCents: number;
  currency: string;
}

/**
 * The price of a place on the wall: pixels × price per pixel, paid once —
 * the pixels then stay on the wall for good. Only the server's result
 * counts; browsers call this just to show an estimate. Returns null for an
 * invalid size.
 */
export function quote(settings: PricingSettings, wBlocks: number, hBlocks: number): Quote | null {
  if (!Number.isInteger(wBlocks) || !Number.isInteger(hBlocks) || wBlocks < 1 || hBlocks < 1) return null;
  const blocks = wBlocks * hBlocks;
  const pixels = blocks * settings.block_size_px * settings.block_size_px;
  const totalCents = Math.round(pixels * settings.price_cents_per_pixel);
  const vatCents = settings.vat_payer ? Math.round((totalCents * settings.vat_rate_pct) / (100 + settings.vat_rate_pct)) : 0;
  return { blocks, pixels, pricePerPixelCents: settings.price_cents_per_pixel, totalCents, vatCents, currency: settings.currency };
}
