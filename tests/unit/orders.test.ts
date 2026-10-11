import { describe, expect, it } from "vitest";
import { layoutText } from "@/lib/content/text-tile";
import { findFreeSpots, occupancyGrid, occupiedCount, prefixSums } from "@/lib/orders/space";
import { validateDetails } from "@/lib/orders/order";
import { clientHash, hashToken, newToken, orderCookieValue, parseOrderCookie, tokenMatches } from "@/lib/orders/tokens";
import { quote } from "@/lib/pricing";
import { DEFAULT_SETTINGS } from "@/lib/settings/schema";
import { signUpload, verifyUpload } from "@/lib/signing";

describe("pricing", () => {
  it("charges 10 cents per pixel, once", () => {
    // One block 10 × 10 px = 100 px = 10 €.
    expect(quote(DEFAULT_SETTINGS, 1, 1)).toMatchObject({ blocks: 1, pixels: 100, pricePerPixelCents: 10, totalCents: 1000 });
    // 50 × 50 px = 250 €, 100 × 100 px = 1 000 €.
    expect(quote(DEFAULT_SETTINGS, 5, 5)?.totalCents).toBe(25_000);
    expect(quote(DEFAULT_SETTINGS, 10, 10)?.totalCents).toBe(100_000);
    // The whole wall: 100 000 €.
    expect(quote(DEFAULT_SETTINGS, 100, 100)?.totalCents).toBe(10_000_000);
  });

  it("refuses invalid sizes", () => {
    expect(quote(DEFAULT_SETTINGS, 0, 1)).toBeNull();
    expect(quote(DEFAULT_SETTINGS, 1.5, 1)).toBeNull();
    expect(quote(DEFAULT_SETTINGS, 1, -2)).toBeNull();
  });

  it("follows the price in the settings", () => {
    expect(quote({ ...DEFAULT_SETTINGS, price_cents_per_pixel: 100 }, 1, 1)?.totalCents).toBe(10_000);
    expect(quote({ ...DEFAULT_SETTINGS, price_cents_per_pixel: 2.5 }, 1, 1)?.totalCents).toBe(250);
  });

  it("states the VAT contained in the final price for VAT payers", () => {
    const q = quote({ ...DEFAULT_SETTINGS, vat_payer: true, vat_rate_pct: 23 }, 1, 1)!;
    expect(q.totalCents).toBe(1000);
    expect(q.vatCents).toBe(187);
    expect(quote(DEFAULT_SETTINGS, 1, 1)!.vatCents).toBe(0);
  });
});

describe("finding free space", () => {
  const grid = occupancyGrid(10, 10, [
    { bx: 4, by: 4 },
    { bx: 5, by: 5 },
  ]);

  it("counts occupied blocks in any rectangle", () => {
    const ps = prefixSums(grid);
    expect(occupiedCount(ps, 10, { x: 0, y: 0, w: 10, h: 10 })).toBe(2);
    expect(occupiedCount(ps, 10, { x: 4, y: 4, w: 1, h: 1 })).toBe(1);
    expect(occupiedCount(ps, 10, { x: 0, y: 0, w: 4, h: 4 })).toBe(0);
  });

  it("offers free spots nearest the centre first, never overlapping", () => {
    const { nearest, random } = findFreeSpots(grid, 2, 2, { rng: () => 0.5 });
    expect(nearest).toHaveLength(3);
    expect(random).toHaveLength(3);
    const all = [...nearest, ...random];
    const ps = prefixSums(grid);
    for (const r of all) expect(occupiedCount(ps, 10, r)).toBe(0);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
    }
    // Closest to the centre (5, 5) without touching the two occupied blocks.
    const d = (r: { x: number; y: number; w: number; h: number }) => Math.hypot(r.x + r.w / 2 - 5, r.y + r.h / 2 - 5);
    expect(d(nearest[0])).toBeLessThanOrEqual(d(nearest[2]));
  });

  it("returns nothing when the size does not fit", () => {
    const full = occupancyGrid(3, 3, Array.from({ length: 9 }, (_, i) => ({ bx: i % 3, by: Math.floor(i / 3) })));
    expect(findFreeSpots(full, 1, 1)).toEqual({ nearest: [], random: [] });
    expect(findFreeSpots(grid, 11, 1)).toEqual({ nearest: [], random: [] });
  });
});

describe("text tiles", () => {
  it("fits exactly one character into a single 10 × 10 block", () => {
    expect(layoutText({ text: "A", align: "center", scale: 0 }, 10, 10)).toMatchObject({ fits: true, lines: ["A"], scale: 1 });
    expect(layoutText({ text: "AB", align: "center", scale: 0 }, 10, 10).fits).toBe(false);
  });

  it("picks the largest size that fits and wraps words", () => {
    const big = layoutText({ text: "HI", align: "center", scale: 0 }, 100, 50);
    expect(big.fits).toBe(true);
    expect(big.scale).toBeGreaterThan(3);
    const wrapped = layoutText({ text: "Hello pixel world", align: "left", scale: 1 }, 60, 40);
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.positions[0].x).toBe(1);
  });

  it("prefers a size that keeps words whole", () => {
    const layout = layoutText({ text: "Ahoj Žilina", align: "center", scale: 0 }, 50, 50);
    expect(layout.fits).toBe(true);
    expect(layout.brokeWords).toBe(false);
    expect(layout.lines).toEqual(["Ahoj", "Žilina"]);
  });

  it("centres and right-aligns lines", () => {
    const c = layoutText({ text: "A", align: "center", scale: 1 }, 41, 20);
    expect(c.positions[0].x).toBe(18);
    const r = layoutText({ text: "A", align: "right", scale: 1 }, 40, 20);
    expect(r.positions[0].x).toBe(40 - 1 - 5);
  });
});

describe("order tokens", () => {
  it("stores only a hash and compares safely", () => {
    const token = newToken();
    const hash = hashToken(token);
    expect(hash).not.toContain(token);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(newToken(), hash)).toBe(false);
    expect(tokenMatches(token, null)).toBe(false);
  });

  it("parses only well-formed order cookies", () => {
    const id = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";
    const token = newToken();
    expect(parseOrderCookie(orderCookieValue(id, token))).toEqual({ id, token });
    expect(parseOrderCookie("nonsense")).toBeNull();
    expect(parseOrderCookie(`${id}.short`)).toBeNull();
    expect(parseOrderCookie(`../etc.${token}`)).toBeNull();
  });

  it("never keeps the visitor's IP address", () => {
    const h = clientHash("192.168.0.1");
    expect(h).not.toContain("192");
    expect(clientHash("192.168.0.1")).toBe(h);
    expect(clientHash("192.168.0.2")).not.toBe(h);
  });
});

describe("signed uploads", () => {
  it("accepts its own signature and rejects changed or expired ones", () => {
    process.env.CRON_SECRET = "test-secret-at-least-16-chars";
    const grant = { bucket: "content", path: "uploads/x/y", maxBytes: 100, contentType: "image/png" };
    const query = new URLSearchParams(signUpload(grant, 1_000));
    expect(verifyUpload(query, 2_000)).toEqual(grant);
    const tampered = new URLSearchParams(query);
    tampered.set("maxBytes", "999999999");
    expect(verifyUpload(tampered, 2_000)).toBeNull();
    expect(verifyUpload(query, 1_000 + 16 * 60_000)).toBeNull();
  });
});

describe("order details", () => {
  const ok = {
    title: "  My   shop ",
    url: "shop.example.com",
    displayName: "",
    email: "Jana@Example.com ",
    terms: true,
    waiver: true,
    marketing: false,
  };

  it("normalises valid input", () => {
    const result = validateDetails(ok);
    expect(result).toEqual({
      ok: true,
      details: { title: "My shop", url: "https://shop.example.com/", displayName: null, email: "jana@example.com", marketing: false },
    });
  });

  it("reports every problem at once", () => {
    const result = validateDetails({ title: "", url: "javascript:alert(1)", displayName: "x".repeat(61), email: "nope", terms: false, waiver: "yes", marketing: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["displayName", "email", "terms", "title", "url", "waiver"]);
    }
    const long = validateDetails({ ...ok, title: "x".repeat(81) });
    expect(long.ok).toBe(false);
  });
});
