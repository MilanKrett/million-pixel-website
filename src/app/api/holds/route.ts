import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { clientIp, isSameOrigin, jsonError, orderCookieOptions, readOrderCookie } from "@/lib/http";
import { createHold } from "@/lib/orders/holds";
import { findOrder } from "@/lib/orders/order";
import { clientHash, hashToken, ORDER_COOKIE, orderCookieValue } from "@/lib/orders/tokens";
import { revalidateWall } from "@/lib/revalidate";
import { loadSettings } from "@/lib/settings/load";
import { verifyTurnstile } from "@/lib/turnstile";

/** Step 2 of the order: reserve the chosen space for a few minutes. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid");
  }
  const rect = { x: Number(body.x), y: Number(body.y), w: Number(body.w), h: Number(body.h) };
  const locale = isLocale(body.locale) ? body.locale : "en";
  const previous = readOrderCookie(request);
  // Bot check when an order starts; changing the place of one's own order needs none.
  const ownOrder = previous ? await findOrder(db(), previous.id, previous.token) : null;
  if (!ownOrder && !(await verifyTurnstile(body.turnstile, clientIp(request)))) return jsonError(400, "captcha");

  const settings = await loadSettings(db());
  const result = await createHold(db(), settings, {
    rect,
    clientHash: clientHash(clientIp(request)),
    locale,
    replaceId: previous?.id,
    replaceTokenHash: previous ? hashToken(previous.token) : null,
  });

  if (!result.ok) {
    if (result.reason === "taken") return jsonError(409, "taken", { blocks: result.blocks, suggestions: result.suggestions });
    const status = result.reason === "rate_limited" ? 429 : result.reason === "sales_paused" ? 503 : 400;
    return jsonError(status, result.reason);
  }

  // Others see the spot as reserved right away.
  revalidateWall();
  const response = NextResponse.json(
    { id: result.id, no: result.no, expiresAt: result.expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(ORDER_COOKIE, orderCookieValue(result.id, result.token), orderCookieOptions());
  return response;
}
