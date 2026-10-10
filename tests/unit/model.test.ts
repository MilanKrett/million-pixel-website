import { describe, expect, it } from "vitest";
import { areaRect, buildModel, CELL_HOLD, CELL_TAKEN, hitAt, imageMapHtml, searchRentals } from "@/components/wall/model";
import type { WallSnapshot } from "@/lib/wall/snapshot";

const snapshot: WallSnapshot = {
  version: 3,
  image: { webp: "/storage/wall/v3.webp", png: "/storage/wall/v3.png" },
  cols: 100,
  rows: 100,
  block: 10,
  rentals: [
    [1, 0, 0, 2, 2, "Bratislavská pekáreň", "Jana", "pekaren.example.sk", "2027-01-01"],
    [2, 10, 10, 1, 1, "Pixel <script>alert(1)</script>", "", "", "2027-06-30"],
    [3, 50, 50, 5, 3, "Retro Games Club", "Peter K.", "games.example.com", "2028-02-02"],
  ],
  taken: [[20, 20, 2, 2]],
  holds: [[30, 30, 3, 1]],
};

describe("wall model", () => {
  const model = buildModel(snapshot);

  it("indexes every block", () => {
    expect(model.cells.length).toBe(10_000);
    expect(hitAt(model, 0, 0)).toEqual({ kind: "rental", index: 0 });
    expect(hitAt(model, 1, 1)).toEqual({ kind: "rental", index: 0 });
    expect(hitAt(model, 2, 0)).toEqual({ kind: "free" });
    expect(hitAt(model, 54, 52)).toEqual({ kind: "rental", index: 2 });
    expect(hitAt(model, 21, 21)).toEqual({ kind: "taken" });
    expect(hitAt(model, 32, 30)).toEqual({ kind: "hold" });
    expect(hitAt(model, 100, 0)).toBeNull();
    expect(hitAt(model, -1, 5)).toBeNull();
    expect(model.cells[20 * 100 + 20]).toBe(CELL_TAKEN);
    expect(model.cells[30 * 100 + 31]).toBe(CELL_HOLD);
    expect(model.freeBlocks).toBe(10_000 - 4 - 1 - 15 - 4 - 3);
  });

  it("returns the whole area for a block", () => {
    expect(areaRect(model, { kind: "rental", index: 2 }, 51, 51)).toEqual({ x: 50, y: 50, w: 5, h: 3 });
    expect(areaRect(model, { kind: "hold" }, 31, 30)).toEqual({ x: 30, y: 30, w: 3, h: 1 });
    expect(areaRect(model, { kind: "free" }, 70, 70)).toEqual({ x: 70, y: 70, w: 1, h: 1 });
  });

  it("finds rentals by title, name or domain, ignoring case and diacritics", () => {
    expect(searchRentals(model, "PEKAREN")).toEqual([0]);
    expect(searchRentals(model, "bratislavska jana")).toEqual([0]);
    expect(searchRentals(model, "example.com")).toEqual([2]);
    expect(searchRentals(model, "peter")).toEqual([2]);
    expect(searchRentals(model, "nothing here")).toEqual([]);
    expect(searchRentals(model, "   ")).toEqual([]);
  });

  it("renders a safe image map (titles are escaped, links go through /go)", () => {
    const html = imageMapHtml(snapshot.rentals, 10);
    expect(html).toContain('coords="0,0,20,20"');
    expect(html).toContain('href="/go/1"');
    expect(html).toContain('rel="nofollow sponsored ugc noopener noreferrer"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // No link for a rental without a URL.
    expect(html).toMatch(/<area shape="rect" coords="100,100,110,110" title="[^"]*" alt="[^"]*">/);
  });
});
