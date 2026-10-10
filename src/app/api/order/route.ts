import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { noStoreJson, readOrderCookie } from "@/lib/http";
import { findOrder } from "@/lib/orders/order";
import { orderResponse } from "@/lib/orders/order-response";
import { loadSettings } from "@/lib/settings/load";

/** The order this browser is working on (to continue after a reload). */
export async function GET(request: NextRequest) {
  const cookie = readOrderCookie(request);
  if (!cookie) return noStoreJson({ order: null });
  const rental = await findOrder(db(), cookie.id, cookie.token);
  if (!rental) return noStoreJson({ order: null });
  const settings = await loadSettings(db());
  return noStoreJson({ order: await orderResponse(db(), settings, rental) });
}
