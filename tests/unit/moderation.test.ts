import { describe, expect, it, vi } from "vitest";
import { placeholders, toCsv } from "@/lib/admin/manage";
import { EMAIL_TEMPLATES, sampleEmail } from "@/lib/email/templates";
import { checkImage, checkLinkReputation, sightengineScores } from "@/lib/moderation/providers";
import { isPublicAddress } from "@/lib/moderation/safe-fetch";
import { flagText } from "@/lib/moderation/text-filter";
import { DEFAULT_SETTINGS } from "@/lib/settings/schema";

describe("text filter", () => {
  it("flags vulgar and hateful words in Slovak and English, also disguised", () => {
    expect(flagText("Kurva svet")).toContain("kurv");
    expect(flagText("F*CK you")).toContain("fuck");
    expect(flagText("sh1t happens")).toContain("shit");
    expect(flagText("Ty kokotko")).toContain("kokot");
    expect(flagText("Heil Hitler")).toEqual(expect.arrayContaining(["heil hitler", "hitler"]));
    expect(flagText("club 1488")).toContain("1488");
  });

  it("leaves normal titles alone", () => {
    for (const title of ["Pekáreň u Jany", "Negroni bar", "Scunthorpe United", "Classic cars", "Assessment centre", "Kúpele Piešťany", "Dickens fan club"]) {
      expect(flagText(title)).toEqual([]);
    }
  });
});

describe("following links safely", () => {
  it("allows only public internet addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.10", "172.20.0.5", "100.64.1.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) expect(isPublicAddress(ip)).toBe(true);
    expect(isPublicAddress("not-an-ip")).toBe(false);
  });
});

describe("outside check services", () => {
  it("skips when no service is set up", async () => {
    delete process.env.LINK_CHECK_PROVIDER;
    delete process.env.IMAGE_MODERATION_PROVIDER;
    expect(await checkLinkReputation(["https://example.com/"])).toMatchObject({ status: "skipped" });
    expect(await checkImage(Buffer.from("x"), "image/png")).toMatchObject({ status: "skipped" });
  });

  it("reads Safe Browsing answers", async () => {
    process.env.LINK_CHECK_PROVIDER = "safebrowsing";
    process.env.GOOGLE_SAFE_BROWSING_API_KEY = "test";
    const fetchMock = vi.fn(async () => Response.json({ matches: [{ threatType: "SOCIAL_ENGINEERING" }] }));
    const result = await checkLinkReputation(["http://phish.example/", "https://final.example/"], fetchMock as unknown as typeof fetch);
    expect(result).toMatchObject({ status: "flagged", threats: ["SOCIAL_ENGINEERING"] });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.threatInfo.threatEntries).toHaveLength(2);
    const clean = await checkLinkReputation(["https://ok.example/"], (async () => Response.json({})) as unknown as typeof fetch);
    expect(clean.status).toBe("ok");
    const broken = await checkLinkReputation(["https://ok.example/"], (async () => new Response("no", { status: 500 })) as unknown as typeof fetch);
    expect(broken.status).toBe("error");
    delete process.env.LINK_CHECK_PROVIDER;
  });

  it("maps image service scores", async () => {
    expect(
      sightengineScores({ nudity: { sexual_activity: 0.1, sexual_display: 0.7, erotica: 0.2, very_suggestive: 0.3 }, weapon: { classes: { firearm: 0.6 } }, gore: { prob: 0.01 } }),
    ).toMatchObject({ sexual: 0.7, weapon: 0.6, violence: 0.01 });
    process.env.IMAGE_MODERATION_PROVIDER = "google";
    process.env.GOOGLE_VISION_API_KEY = "test";
    const answer = { responses: [{ safeSearchAnnotation: { adult: "VERY_LIKELY", violence: "UNLIKELY", racy: "POSSIBLE", medical: "VERY_UNLIKELY" } }] };
    const result = await checkImage(Buffer.from("png"), "image/png", (async () => Response.json(answer)) as unknown as typeof fetch);
    expect(result.status).toBe("flagged");
    expect(result.scores.sexual).toBeGreaterThan(0.9);
    delete process.env.IMAGE_MODERATION_PROVIDER;
  });
});

describe("e-mail templates", () => {
  it("builds every e-mail in both languages", () => {
    for (const locale of ["en", "sk"] as const) {
      for (const template of EMAIL_TEMPLATES) {
        const mail = sampleEmail({ settings: DEFAULT_SETTINGS }, template, locale);
        expect(mail.subject.length).toBeGreaterThan(3);
        expect(mail.html).toContain(DEFAULT_SETTINGS.site_name);
        expect(mail.text).not.toMatch(/\{[a-z]+\}/i);
      }
    }
  });

  it("uses texts changed in the admin", () => {
    const mail = sampleEmail({ settings: DEFAULT_SETTINGS, texts: { sk: { "paid.subject": "Ďakujeme za platbu!" } } }, "paid", "sk");
    expect(mail.subject).toBe("Ďakujeme za platbu!");
    expect(sampleEmail({ settings: DEFAULT_SETTINGS, texts: { sk: { "paid.subject": "x" } } }, "paid", "en").subject).not.toBe("x");
  });

  it("finds placeholders of a message", () => {
    expect([...placeholders("Hi {name}, {count, plural, one {# day} other {# days}} left").keys()]).toEqual(["name", "count"]);
    expect(placeholders("{n, plural, one {#} other {#}}").get("n")).toBe("number");
  });
});

describe("CSV export", () => {
  it("escapes quotes and stops spreadsheet formulas", () => {
    const csv = toCsv([["a", 'say "hi"', "=HYPERLINK(1)", null, 3]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('a,"say ""hi""",\'=HYPERLINK(1),,3');
  });
});
