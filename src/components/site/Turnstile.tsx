"use client";

import { useEffect, useRef } from "react";
import { useAppLocale } from "@/i18n/provider";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    window.onTurnstileLoad = () => resolve();
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile could not load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Cloudflare Turnstile widget. Renders nothing when the site has no key
 * (local development); the server then does not ask for a token either.
 * `resetKey` changes after each use, because a token works only once.
 */
export function Turnstile({ siteKey, onToken, resetKey = 0 }: { siteKey: string | null; onToken: (token: string | null) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const locale = useAppLocale();
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let id: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        id = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          language: locale,
          theme: "light",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
      onTokenRef.current(null);
    };
  }, [siteKey, locale, resetKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="turnstile" />;
}
