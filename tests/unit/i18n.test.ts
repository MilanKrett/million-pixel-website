import { describe, expect, it } from "vitest";
import { createTranslator } from "use-intl/core";
import { getMessages, intlLocale, localePath, stripLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import en from "@/messages/en.json";
import sk from "@/messages/sk.json";

type Tree = { [key: string]: string | Tree };

/** Intl uses no-break spaces (U+00A0, U+202F) between digits and units; compare them as plain spaces. */
const NO_BREAK_SPACES = new RegExp("[\\u00a0\\u202f]", "g");
const plain = (s: string) => s.replace(NO_BREAK_SPACES, " ");

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});
}

/** Top-level ICU argument names, e.g. "{count, plural, …} {name}" → count, name. */
function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    if (message[i] === "{") {
      if (depth === 0) {
        const match = /^\{\s*([a-zA-Z0-9_]+)/.exec(message.slice(i));
        if (match) names.add(match[1]);
      }
      depth++;
    } else if (message[i] === "}") depth--;
  }
  return [...names].sort();
}

describe("translations", () => {
  const flatEn = flatten(en as Tree);
  const flatSk = flatten(sk as Tree);

  it("Slovak and English have exactly the same keys", () => {
    expect(Object.keys(flatSk).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it("every message uses the same placeholders in both languages", () => {
    for (const key of Object.keys(flatEn)) {
      expect(argumentsOf(flatSk[key]), key).toEqual(argumentsOf(flatEn[key]));
    }
  });

  it("no message is empty", () => {
    for (const [key, value] of [...Object.entries(flatEn), ...Object.entries(flatSk)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("uses correct Slovak plural forms", () => {
    const t = createTranslator({ locale: intlLocale("sk"), messages: getMessages("sk"), timeZone: "Europe/Bratislava" });
    expect(t("common.pixels", { count: 1 })).toBe("1 pixel");
    expect(t("common.pixels", { count: 3 })).toBe("3 pixely");
    expect(t("common.pixels", { count: 100 })).toBe("100 pixelov");
    expect(plain(t("common.pixels", { count: 1_000_000 }))).toBe("1 000 000 pixelov");
    expect(t("common.pricePerPixel", { cents: 10 })).toBe("10 centov za pixel");
    expect(t("common.pricePerPixel", { cents: 2 })).toBe("2 centy za pixel");
  });

  it("formats English the same way", () => {
    const t = createTranslator({ locale: intlLocale("en"), messages: getMessages("en"), timeZone: "Europe/Bratislava" });
    expect(t("common.pixels", { count: 1_000_000 })).toBe("1,000,000 pixels");
    expect(t("common.pricePerPixel", { cents: 10 })).toBe("10 cents per pixel");
    expect(t("common.pricePerPixel", { cents: 1 })).toBe("1 cent per pixel");
  });

  it("formats prices per language", () => {
    expect(plain(formatMoney(1000, "EUR", "sk-SK"))).toBe("10 €");
    expect(formatMoney(1000, "EUR", "en-GB")).toBe("€10");
    expect(plain(formatMoney(10, "EUR", "sk-SK"))).toBe("0,10 €");
    expect(formatMoney(100_000_00, "EUR", "en-GB")).toBe("€100,000");
  });

  it("builds and strips language prefixes", () => {
    expect(localePath("en", "/")).toBe("/");
    expect(localePath("sk", "/")).toBe("/sk");
    expect(localePath("sk", "/faq")).toBe("/sk/faq");
    expect(localePath("sk", "/?x=1")).toBe("/sk?x=1");
    expect(localePath("en", "/rent?x=1")).toBe("/rent?x=1");
    expect(stripLocale("/sk/faq")).toBe("/faq");
    expect(stripLocale("/sk")).toBe("/");
    expect(stripLocale("/en/faq")).toBe("/faq");
    expect(stripLocale("/skate")).toBe("/skate");
    expect(stripLocale("/faq")).toBe("/faq");
  });
});
