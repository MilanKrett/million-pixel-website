import { after, type NextRequest } from "next/server";
import { createContactMessage, notifyContactMessage } from "@/lib/contact";
import { db } from "@/lib/db";
import { clientIp, isSameOrigin, jsonError, noStoreJson } from "@/lib/http";
import { clientHash } from "@/lib/orders/tokens";
import { verifyTurnstile } from "@/lib/turnstile";

/** A message from the contact form: {topic, name, email, rentalNo, message, locale, turnstile}. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "invalid");
  const ip = clientIp(request);
  if (!(await verifyTurnstile(body.turnstile, ip))) return jsonError(400, "captcha");
  const result = await createContactMessage(db(), {
    topic: body.topic,
    name: body.name,
    email: body.email,
    rentalNo: body.rentalNo,
    message: body.message,
    locale: body.locale,
    clientKey: clientHash(ip),
  });
  if (!result.ok) return jsonError(result.reason === "rate_limited" ? 429 : 400, result.reason);
  after(() => notifyContactMessage(db(), result.id));
  return noStoreJson({ ok: true, email: result.email });
}
