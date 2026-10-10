import { NextResponse, type NextRequest } from "next/server";
import { adminConfigured, isAdminAuthorization } from "@/lib/admin-auth";

/**
 * 1. /admin and /api/admin: temporary password protection (phase 3 brings accounts).
 * 2. Language routing: English pages at "/…" (internally "/en/…"), Slovak at
 *    "/sk/…"; "/en/…" redirects to the address without prefix.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (first === "admin" || pathname.startsWith("/api/admin/")) {
    if (!adminConfigured()) return new NextResponse("Not found", { status: 404 });
    if (!isAdminAuthorization(request.headers.get("authorization"))) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Admin", charset="UTF-8"' },
      });
    }
    return NextResponse.next();
  }

  if (first === "api" || first === "go" || first === "storage") return NextResponse.next();
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
  // Pages and /api/admin. Other API routes (uploads!), /go, /storage, Next.js
  // internals and files with an extension (robots.txt, icons, …) skip the proxy.
  matcher: ["/((?!_next/|api/(?!admin/)|go/|storage/|.*\\.[a-zA-Z0-9]+$).*)"],
};
