import type { NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { clientIp, isSameOrigin, jsonError, noStoreJson } from "@/lib/http";
import { createReport } from "@/lib/moderation/reports";
import { clientHash } from "@/lib/orders/tokens";
import { verifyTurnstile } from "@/lib/turnstile";

/** A visitor reports a rental (DSA notice). Anyone may report; limits and Turnstile stop spam. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "invalid");
  const ip = clientIp(request);
  if (!(await verifyTurnstile(body.turnstile, ip))) return jsonError(400, "captcha");
  const result = await createReport(db(), {
    rentalNo: body.rentalNo,
    category: body.category,
    description: body.description,
    email: body.email,
    locale: isLocale(body.locale) ? body.locale : "en",
    clientKey: clientHash(ip),
  });
  if (!result.ok) return jsonError(result.reason === "rate_limited" ? 429 : 400, result.reason);
  return noStoreJson({ reference: result.reference });
}
