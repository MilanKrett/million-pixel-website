import { describe, expect, it } from "vitest";
import { GLYPH_HEIGHT, GLYPH_WIDTH, glyph, hasOwnGlyph } from "@/lib/pixel-font";

/** Letters and punctuation of the ten site languages. */
const ALPHABETS: Record<string, string> = {
  en: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?'\"()-/&@#%+=€$",
  sk: "áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ„“",
  cs: "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ„“",
  de: "äöüßÄÖÜ„“»«",
  pl: "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„”",
  hu: "áéíóöőúüűÁÉÍÓÖŐÚÜŰ„”",
  fr: "àâæçéèêëîïôœùûüÿÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ«»’",
  es: "áéíóúüñÁÉÍÓÚÜÑ¿¡«»",
  it: "àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ’",
  pt: "áâãàçéêíóôõúÁÂÃÀÇÉÊÍÓÔÕÚ",
};

describe("pixel font", () => {
  for (const [locale, letters] of Object.entries(ALPHABETS)) {
    it(`has its own glyph for every character of ${locale}`, () => {
      const missing = [...letters].filter((ch) => !hasOwnGlyph(ch));
      expect(missing).toEqual([]);
    });
  }

  it("draws every glyph on a 5 × 7 grid", () => {
    for (const ch of Object.values(ALPHABETS).join("")) {
      const g = glyph(ch);
      expect(g).toHaveLength(GLYPH_HEIGHT);
      for (const row of g) expect(row).toHaveLength(GLYPH_WIDTH);
    }
  });

  it("tells accented letters apart from their base letter", () => {
    const same = (a: string, b: string) => JSON.stringify(glyph(a)) === JSON.stringify(glyph(b));
    for (const [accented, base] of [["ö", "o"], ["ő", "ö"], ["ñ", "n"], ["ç", "c"], ["ł", "l"], ["ż", "z"], ["ź", "ż"], ["ã", "â"], ["Ü", "U"]]) {
      expect(same(accented, base), `${accented} vs ${base}`).toBe(false);
    }
  });

  it("prints no-break spaces as spaces and unknown letters by their base", () => {
    expect(glyph(" ")).toEqual(glyph(" "));
    expect(glyph("ā")).toEqual(glyph("a"));
  });
});
