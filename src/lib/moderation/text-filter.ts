/**
 * Flags vulgar and hateful words in titles and names (Slovak, Czech and
 * English). It only warns the moderator, it never blocks: lists like this
 * always have false positives, and a human decides anyway.
 *
 * Words are compared after removing diacritics and common look-alike
 * characters ("sh1t", "kür*a"), at the start of a word, so "Scunthorpe"-style
 * accidents inside longer words are rare.
 */

/** Matches when a word starts with one of these. */
const PREFIXES = [
  // English
  "fuck", "motherfuck", "shit", "cunt", "bitch", "whore", "slut", "nigg", "faggot", "retard", "asshole",
  "bastard", "wanker", "twat", "cocksuck", "dickhead", "tranny",
  // Slovak / Czech
  "kurv", "kokot", "jebat", "jeban", "pojeb", "vyjeb", "zajeb", "dojeb", "najeb", "ojeb", "rozjeb", "zmrd",
  "chuj", "debil", "hovn", "srack", "mrdat", "mrdka", "kreten", "buzerant", "cigan", "pici", "picu",
  "sukat", "skurv", "prdel", "curak",
];

/** Matches whole words only. */
const WORDS = ["fag", "fags", "dick", "dicks", "cock", "cocks", "pussy", "kike", "chink", "spic", "rape", "rapist", "pica", "pice", "buzna", "hitler", "kkk",
  // whole words, so "Negroni" is not flagged
  "negr", "negra", "negri", "negrov", "negrom", "negroch", "negrovi"];

/** Hateful phrases and number codes. */
const PHRASES = ["heil hitler", "sieg heil", "white power", "biela sila", "smrt zidom", "gas the jews", "1488", "14 88"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

/** Lower case, no diacritics, look-alike digits as letters; "*" stays (it hides a letter). */
export function normalizeForFilter(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[0134579@$!]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, "$1$1");
}

/** Does a word (where "*" stands for any letter) start with, or equal, the term? */
function matches(word: string, term: string, whole: boolean): boolean {
  if (whole ? word.length !== term.length : word.length < term.length) return false;
  for (let i = 0; i < term.length; i++) if (word[i] !== "*" && word[i] !== term[i]) return false;
  return true;
}

/** Found terms (normalized), empty when the text looks fine. */
export function flagText(...texts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const raw of texts) {
    if (!raw) continue;
    // Number codes are checked before look-alike replacement turns digits into letters.
    const digits = raw.replace(/[^0-9]+/g, " ");
    for (const phrase of PHRASES) if (/^[\d ]+$/.test(phrase) && ` ${digits} `.includes(` ${phrase} `)) found.add(phrase);
    const text = normalizeForFilter(raw);
    // A "word" made only of stars says nothing.
    const words = text.split(/[^a-z*]+/).filter((w) => /[a-z]/.test(w));
    const spaced = ` ${words.join(" ")} `;
    for (const word of words) {
      for (const p of PREFIXES) if (matches(word, p, false)) found.add(p);
      for (const w of WORDS) if (matches(word, w, true)) found.add(w);
    }
    for (const phrase of PHRASES) if (!/^[\d ]+$/.test(phrase) && spaced.includes(` ${phrase} `)) found.add(phrase);
  }
  return [...found];
}
