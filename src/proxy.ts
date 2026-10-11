import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, LANGUAGE_COOKIE, localePath, matchLocale } from "@/i18n/config";

/**
 * Language routing: English pages at "/…" (internally "/en/…"), the other
 * languages at "/<code>/…"; "/en/…" redirects to the address without
 * prefix. A first visit to the home page goes to the browser's language when
 * we have it (only the home page, and only until the visitor picks a
 * language in the switch). The admin (/admin) has its own root layout and
 * checks the signed-in staff account on every page and API call.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === "admin" || first === "api" || first === "go" || first === "storage" || first === "og") return NextResponse.next();
  if (isLocale(first) && first !== DEFAULT_LOCALE) return NextResponse.next();

  if (first === DEFAULT_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/" && !request.cookies.has(LANGUAGE_COOKIE)) {
    const preferred = matchLocale(request.headers.get("accept-language"));
    if (preferred && preferred !== DEFAULT_LOCALE) {
      const url = request.nextUrl.clone();
      url.pathname = localePath(preferred, "/");
      const response = NextResponse.redirect(url, 307);
      response.headers.set("Vary", "Accept-Language, Cookie");
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Pages only. API routes, /go, /storage, /og, Next.js internals and files
  // with an extension (robots.txt, sitemap.xml, icons, …) skip the proxy.
  matcher: ["/((?!_next/|api/|go/|storage/|og/|.*\\.[a-zA-Z0-9]+$).*)"],
};
