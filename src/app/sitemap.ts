import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALES, localePath } from "@/i18n/config";
import { siteUrl } from "@/lib/email/templates";

/** Public pages that search engines should know, in all ten languages (spec section 13). */
const PAGES: { path: string; daily?: boolean; priority: number }[] = [
  { path: "/", daily: true, priority: 1 },
  { path: "/buy", priority: 0.8 },
  { path: "/how-it-works", priority: 0.7 },
  { path: "/faq", priority: 0.6 },
  { path: "/latest", daily: true, priority: 0.6 },
  { path: "/contact", priority: 0.3 },
  { path: "/content-rules", priority: 0.3 },
  { path: "/terms", priority: 0.2 },
  { path: "/complaints", priority: 0.2 },
  { path: "/privacy", priority: 0.2 },
  { path: "/report", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PAGES.flatMap(({ path, daily, priority }) => {
    const languages: Record<string, string> = Object.fromEntries(LOCALES.map((l) => [l, `${base}${localePath(l, path)}`]));
    languages["x-default"] = `${base}${localePath(DEFAULT_LOCALE, path)}`;
    return LOCALES.map((locale) => ({
      url: `${base}${localePath(locale, path)}`,
      changeFrequency: daily ? ("daily" as const) : ("monthly" as const),
      priority,
      alternates: { languages },
    }));
  });
}
