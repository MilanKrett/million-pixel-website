"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Share pages exist for the previews on social networks; people who open
 * one go straight on to the wall, zoomed in on the place. Link-preview
 * robots do not run scripts, so they read the page's preview tags. The
 * inline script runs as soon as the page arrives (before React starts); the
 * effect covers navigations inside the app.
 */
export function SpotRedirect({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  // `href` is built from numbers and a language code only; "<" is escaped anyway.
  const script = `location.replace(${JSON.stringify(href).replace(/</g, "\\u003c")})`;
  return (
    <>
      <p className="muted small" role="status">
        {label}
      </p>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
