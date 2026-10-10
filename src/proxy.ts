import { NextResponse, type NextRequest } from "next/server";

/**
 * Language routing. English pages live at "/…" (internally "/en/…"),
 * Slovak pages at "/sk/…". "/en/…" redirects to the address without prefix.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === "sk") return NextResponse.next();

  if (first === "en") {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except API routes, the link redirector, local file storage,
  // Next.js internals and files with an extension (robots.txt, icons, …).
  matcher: ["/((?!api/|go/|storage/|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
