import { describe, expect, it } from "vitest";
import { displayDomain, normalizeUrl } from "@/lib/url";

describe("renter links", () => {
  it("accepts http(s) links and adds https:// when missing", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com/");
    expect(normalizeUrl("http://shop.example.sk/a?b=1")).toBe("http://shop.example.sk/a?b=1");
    expect(normalizeUrl("  example.com/page  ")).toBe("https://example.com/page");
    expect(normalizeUrl("HTTPS://EXAMPLE.COM/Path")).toBe("https://example.com/Path");
    expect(normalizeUrl("https://example.com/#section")).toBe("https://example.com/");
    expect(normalizeUrl("https://xn--pekre-qra.example.sk")).toBe("https://xn--pekre-qra.example.sk/");
  });

  it("converts international domain names to their ASCII form", () => {
    expect(normalizeUrl("https://pekáreň.sk")).toMatch(/^https:\/\/xn--/);
  });

  it("refuses dangerous or private links", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "file:///etc/passwd",
      "ftp://example.com",
      "https://user:pass@example.com",
      "http://localhost:3000",
      "http://app.localhost",
      "http://127.0.0.1",
      "http://192.168.0.1/admin",
      "http://[::1]/",
      "https://intranet",
      "",
      "   ",
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      expect(normalizeUrl(bad), bad).toBeNull();
    }
  });

  it("shows only the domain", () => {
    expect(displayDomain("https://www.shop.example.com/x?y")).toBe("shop.example.com");
    expect(displayDomain(null)).toBe("");
    expect(displayDomain("not a url")).toBe("");
  });
});
