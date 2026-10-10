import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, SETTING_KEYS, settingsSchema, wallGrid } from "@/lib/settings/schema";

describe("settings", () => {
  it("defaults match the project parameters", () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(DEFAULT_SETTINGS.wall_width_px * DEFAULT_SETTINGS.wall_height_px).toBe(1_000_000);
    expect(DEFAULT_SETTINGS.block_size_px).toBe(10);
    expect(DEFAULT_SETTINGS.price_cents_per_pixel_year).toBe(10);
    expect(DEFAULT_SETTINGS.periods).toEqual([
      { years: 1, discount_pct: 0 },
      { years: 3, discount_pct: 10 },
      { years: 5, discount_pct: 20 },
    ]);
    expect(DEFAULT_SETTINGS.hold_minutes).toBe(15);
    expect(DEFAULT_SETTINGS.checkout_hold_minutes).toBe(30);
    expect(DEFAULT_SETTINGS.grace_days).toBe(14);
    expect(DEFAULT_SETTINGS.max_blocks).toBeNull();
    expect(wallGrid(DEFAULT_SETTINGS)).toEqual({ cols: 100, rows: 100, block: 10, width: 1000, height: 1000 });
  });

  it("uses stored values and ignores unknown keys", () => {
    const s = mergeSettings([
      { key: "price_cents_per_pixel_year", value: 12 },
      { key: "site_name", value: "PixelStena" },
      { key: "something_old", value: 1 },
    ]);
    expect(s.price_cents_per_pixel_year).toBe(12);
    expect(s.site_name).toBe("PixelStena");
    expect(s).not.toHaveProperty("something_old");
  });

  it("falls back to the default for an invalid stored value", () => {
    const s = mergeSettings([
      { key: "hold_minutes", value: "fifteen" },
      { key: "checkout_hold_minutes", value: 10 }, // Stripe needs at least 30
      { key: "periods", value: [] },
    ]);
    expect(s.hold_minutes).toBe(15);
    expect(s.checkout_hold_minutes).toBe(30);
    expect(s.periods).toHaveLength(3);
  });

  it("rejects a wall that is not a multiple of the block size", () => {
    const s = mergeSettings([{ key: "block_size_px", value: 7 }]);
    expect(s.block_size_px).toBe(10);
  });

  it("has a default for every key", () => {
    for (const key of SETTING_KEYS) expect(DEFAULT_SETTINGS[key]).not.toBeUndefined();
  });
});
