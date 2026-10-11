import { NextResponse, type NextRequest } from "next/server";

/**
 * Language routing: English pages at "/…" (internally "/en/…"), Slovak at
 * "/sk/…"; "/en/…" redirects to the address without prefix. The admin
 * (/admin) has its own root layout and checks the signed-in staff account
 * on every page and API call.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === "admin" || first === "api" || first === "go" || first === "storage") return NextResponse.next();
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
  // Pages only. API routes, /go, /storage, Next.js internals and files with an
  // extension (robots.txt, icons, …) skip the proxy.
  matcher: ["/((?!_next/|api/|go/|storage/|.*\\.[a-zA-Z0-9]+$).*)"],
};
