import type { MetadataRoute } from "next";
import { LOCALES, localePath } from "@/i18n/config";
import { siteUrl } from "@/lib/email/templates";

/** Private pages in every language (they also say "noindex"). Share pages and their pictures stay open for link previews. */
const PRIVATE = ["/my-pixels", "/login", "/transfer", "/dev/", "/buy/thanks"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/go/", "/storage/", ...PRIVATE.flatMap((path) => LOCALES.map((l) => localePath(l, path)))],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
