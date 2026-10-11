import { describe, expect, it } from "vitest";
import { createTranslator } from "use-intl/core";
import { adminLocale, intlLocale, localeOfPath, localePath, LOCALES, matchLocale, stripLocale, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { formatMoney } from "@/lib/money";
import adminEn from "@/messages/admin/en.json";
import adminSk from "@/messages/admin/sk.json";

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

/** Rich-text tags such as <link>…</link>. */
function tagsOf(message: string): string[] {
  return [...new Set([...message.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)>/g)].map((m) => m[1]))].sort();
}

const translator = (locale: Locale) => createTranslator({ locale: intlLocale(locale), messages: getMessages(locale), timeZone: "Europe/Bratislava" });

describe("translations", () => {
  const flatEn = flatten(getMessages("en") as unknown as Tree);

  for (const locale of LOCALES.filter((l) => l !== "en")) {
    describe(locale, () => {
      const flat = flatten(getMessages(locale) as unknown as Tree);

      it("has exactly the same keys as English", () => {
        expect(Object.keys(flat).sort()).toEqual(Object.keys(flatEn).sort());
      });

      it("uses the same placeholders and tags as English", () => {
        for (const key of Object.keys(flatEn)) {
          expect(argumentsOf(flat[key] ?? ""), `${locale}: ${key}`).toEqual(argumentsOf(flatEn[key]));
          expect(tagsOf(flat[key] ?? ""), `${locale}: ${key}`).toEqual(tagsOf(flatEn[key]));
        }
      });

      it("formats every message without errors", () => {
        const t = createTranslator({
          locale: intlLocale(locale),
          messages: getMessages(locale),
          timeZone: "Europe/Bratislava",
          onError: (error) => {
            throw new Error(`${locale}: ${error.message}`);
          },
        });
        for (const key of Object.keys(flat)) {
          const values: Record<string, unknown> = {};
          for (const name of argumentsOf(flat[key])) values[name] = 2;
          for (const tag of tagsOf(flat[key])) values[tag] = (chunks: string) => chunks;
          expect(() => t.markup(key as never, values as never), `${locale}: ${key}`).not.toThrow();
        }
      });
    });
  }

  it("no message is empty", () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(flatten(getMessages(locale) as unknown as Tree))) {
        expect(value.trim(), `${locale}: ${key}`).not.toBe("");
      }
    }
  });

  it("has no ASCII apostrophe that ICU would read as a quote", () => {
    // In ICU messages '{ or '# starts a quoted literal ("l'{site}" would print "l{site}").
    // Texts use the typographic apostrophe ’ instead.
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(flatten(getMessages(locale) as unknown as Tree))) {
        expect(value, `${locale}: ${key}`).not.toMatch(/'[{}#|]/);
      }
    }
  });

  it("the admin is complete in English and Slovak", () => {
    const en = flatten(adminEn as unknown as Tree);
    const sk = flatten(adminSk as unknown as Tree);
    expect(Object.keys(sk).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) expect(argumentsOf(sk[key]), key).toEqual(argumentsOf(en[key]));
  });

  it("uses correct Slovak plural forms", () => {
    const t = translator("sk");
    expect(t("common.pixels", { count: 1 })).toBe("1 pixel");
    expect(t("common.pixels", { count: 3 })).toBe("3 pixely");
    expect(t("common.pixels", { count: 100 })).toBe("100 pixelov");
    expect(plain(t("common.pixels", { count: 1_000_000 }))).toBe("1 000 000 pixelov");
    expect(t("common.pricePerPixel", { cents: 10 })).toBe("10 centov za pixel");
    expect(t("common.pricePerPixel", { cents: 2 })).toBe("2 centy za pixel");
  });

  it("formats English the same way", () => {
    const t = translator("en");
    expect(t("common.pixels", { count: 1_000_000 })).toBe("1,000,000 pixels");
    expect(t("common.pricePerPixel", { cents: 10 })).toBe("10 cents per pixel");
    expect(t("common.pricePerPixel", { cents: 1 })).toBe("1 cent per pixel");
  });

  it("formats prices per language", () => {
    expect(plain(formatMoney(1000, "EUR", "sk-SK"))).toBe("10 €");
    expect(formatMoney(1000, "EUR", "en-GB")).toBe("€10");
    expect(plain(formatMoney(10, "EUR", "sk-SK"))).toBe("0,10 €");
    expect(formatMoney(100_000_00, "EUR", "en-GB")).toBe("€100,000");
    expect(plain(formatMoney(1050, "EUR", intlLocale("de")))).toBe("10,50 €");
    expect(plain(formatMoney(1050, "EUR", intlLocale("fr")))).toBe("10,50 €");
  });

  it("builds and strips language prefixes", () => {
    expect(localePath("en", "/")).toBe("/");
    expect(localePath("sk", "/")).toBe("/sk");
    expect(localePath("sk", "/faq")).toBe("/sk/faq");
    expect(localePath("de", "/?x=1")).toBe("/de?x=1");
    expect(localePath("en", "/rent?x=1")).toBe("/rent?x=1");
    expect(stripLocale("/sk/faq")).toBe("/faq");
    expect(stripLocale("/sk")).toBe("/");
    expect(stripLocale("/en/faq")).toBe("/faq");
    expect(stripLocale("/pl/my-pixels/3")).toBe("/my-pixels/3");
    expect(stripLocale("/skate")).toBe("/skate");
    expect(stripLocale("/italy")).toBe("/italy");
    expect(stripLocale("/faq")).toBe("/faq");
    expect(localeOfPath("/hu/faq")).toBe("hu");
    expect(localeOfPath("/faq")).toBe("en");
  });

  it("picks the visitor's language from Accept-Language", () => {
    expect(matchLocale("de-AT,de;q=0.9,en;q=0.8")).toBe("de");
    expect(matchLocale("en-US,en;q=0.9,sk;q=0.8")).toBe("en");
    expect(matchLocale("ru-RU,ru;q=0.9,pl;q=0.5")).toBe("pl");
    expect(matchLocale("ja,zh;q=0.5")).toBeNull();
    expect(matchLocale("pt-BR")).toBe("pt");
    expect(matchLocale("fr;q=0.2,cs;q=0.7")).toBe("cs");
    expect(matchLocale("*")).toBeNull();
    expect(matchLocale("")).toBeNull();
    expect(matchLocale(null)).toBeNull();
  });

  it("uses English or Slovak for the admin", () => {
    expect(adminLocale("sk")).toBe("sk");
    expect(adminLocale("de")).toBe("en");
    expect(adminLocale(null)).toBe("en");
  });
});
