import type { NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { requestLoginLink } from "@/lib/auth/login";
import { db } from "@/lib/db";
import { clientIp, isSameOrigin, jsonError, noStoreJson } from "@/lib/http";
import { clientHash } from "@/lib/orders/tokens";
import { verifyTurnstile } from "@/lib/turnstile";

/** Ask for a sign-in link. The answer is the same whether or not the address has rentals. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid");
  }
  const ip = clientIp(request);
  if (!(await verifyTurnstile(body.turnstile, ip))) return jsonError(400, "captcha");
  const result = await requestLoginLink(db(), {
    email: body.email,
    locale: isLocale(body.locale) ? body.locale : "en",
    next: body.next,
    clientKey: clientHash(ip),
  });
  if (result === "invalid") return jsonError(400, "email_invalid");
  if (result === "rate_limited") return jsonError(429, "rate_limited");
  return noStoreJson({ sent: true });
}
