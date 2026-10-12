import { z } from "zod";
import { LOCALES } from "@/i18n/config";

/**
 * Every tunable value of the business lives here: prices, sizes, deadlines,
 * texts in the header. The defaults below are copied to the `settings` table by
 * `npm run db:migrate` and can then be changed in the admin without a deploy.
 */

/** A text per site language; a language left empty uses the built-in translation (or English). */
const localizedText = (max: number) => z.partialRecord(z.enum(LOCALES), z.string().trim().max(max));
export type LocalizedText = z.infer<ReturnType<typeof localizedText>>;

export const settingsSchema = z.object({
  // Branding and operator
  site_name: z.string().trim().min(1).max(60),
  // Slogan after "1,000,000 pixels • 10 cents per pixel" in the header.
  tagline: localizedText(120),
  operator_name: z.string().trim().max(200),
  operator_id: z.string().trim().max(60),
  operator_address: z.string().trim().max(300),
  contact_email: z.string().trim().max(254),

  // Wall geometry. Locked once the first place is sold or reserved.
  wall_width_px: z.number().int().min(100).max(4000),
  wall_height_px: z.number().int().min(100).max(4000),
  block_size_px: z.number().int().min(1).max(100),

  // Pricing: pixels are bought once and stay on the wall for good (final
  // prices, VAT included when vat_payer = true).
  price_cents_per_pixel: z.number().min(0).max(100_000),
  min_blocks: z.number().int().min(1),
  max_blocks: z.number().int().min(1).nullable(),
  currency: z.string().length(3),
  vat_payer: z.boolean(),
  vat_rate_pct: z.number().min(0).max(50),

  // Reservations and deadlines
  hold_minutes: z.number().int().min(1).max(120),
  // Stripe Checkout Sessions must live between 30 minutes and 24 hours.
  checkout_hold_minutes: z.number().int().min(30).max(24 * 60),
  review_hours: z.number().int().min(1).max(24 * 14),
  reupload_days: z.number().int().min(1).max(60),
  max_active_holds: z.number().int().min(1).max(50),
  magic_link_minutes: z.number().int().min(5).max(60),
  transfer_days: z.number().int().min(1).max(60),

  // Uploads
  upload_max_mb: z.number().min(1).max(50),
  upload_max_px: z.number().int().min(500).max(12_000),
  upload_formats: z.array(z.enum(["png", "jpeg", "webp", "gif"])).min(1),

  // Site switches
  // Notice above the header (maintenance, news). Empty = none.
  announcement: localizedText(300),
  sales_paused: z.boolean(),
  direct_link_open: z.boolean(),
}).refine(
  (s) => s.wall_width_px % s.block_size_px === 0 && s.wall_height_px % s.block_size_px === 0,
  { message: "Wall size must be a multiple of the block size", path: ["block_size_px"] },
);

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  site_name: "Million Pixel Website",
  tagline: {},
  operator_name: "[operator name or company]",
  operator_id: "[company ID]",
  operator_address: "[registered address]",
  contact_email: "[contact e-mail]",

  wall_width_px: 1000,
  wall_height_px: 1000,
  block_size_px: 10,

  price_cents_per_pixel: 10,
  min_blocks: 1,
  max_blocks: null,
  currency: "EUR",
  vat_payer: false,
  vat_rate_pct: 23,

  hold_minutes: 15,
  checkout_hold_minutes: 30,
  review_hours: 24,
  reupload_days: 7,
  max_active_holds: 3,
  magic_link_minutes: 15,
  transfer_days: 7,

  upload_max_mb: 10,
  upload_max_px: 6000,
  upload_formats: ["png", "jpeg", "webp", "gif"],

  announcement: {},
  sales_paused: false,
  direct_link_open: false,
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

/** Keys that cannot change after the first rental exists. */
export const GEOMETRY_KEYS: readonly SettingKey[] = [
  "wall_width_px",
  "wall_height_px",
  "block_size_px",
];

/**
 * Merge stored values over the defaults. A stored value that no longer passes
 * validation (for example after a schema change) falls back to its default
 * instead of breaking the site.
 */
export function mergeSettings(rows: ReadonlyArray<{ key: string; value: unknown }>): Settings {
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const shape = settingsSchema.shape;
  for (const row of rows) {
    if (!(row.key in shape)) continue;
    const parsed = shape[row.key as SettingKey].safeParse(row.value);
    if (parsed.success) merged[row.key] = parsed.data;
  }
  const result = settingsSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_SETTINGS;
}

/** Wall size in blocks. */
export function wallGrid(s: Pick<Settings, "wall_width_px" | "wall_height_px" | "block_size_px">) {
  return {
    cols: Math.floor(s.wall_width_px / s.block_size_px),
    rows: Math.floor(s.wall_height_px / s.block_size_px),
    block: s.block_size_px,
    width: s.wall_width_px,
    height: s.wall_height_px,
  };
}

export type WallGrid = ReturnType<typeof wallGrid>;
