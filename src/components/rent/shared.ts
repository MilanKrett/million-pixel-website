import type { Rect } from "@/lib/geometry";
import type { OrderResponse } from "@/lib/orders/order-response";
import type { PricingSettings } from "@/lib/pricing";

export type { OrderResponse };

/** Settings the order flow needs in the browser (prices are shown as estimates only). */
export interface RentConfig extends PricingSettings {
  cols: number;
  rows: number;
  minBlocks: number;
  maxBlocks: number | null;
  holdMinutes: number;
  uploadMaxMb: number;
  uploadMaxPx: number;
  uploadFormats: string[];
  salesPaused: boolean;
  reviewHours: number;
  devPayments: boolean;
  devEmails: boolean;
  /** Cloudflare Turnstile site key, or null when bot protection is off (local development). */
  turnstileSiteKey: string | null;
}

export type Step = "select" | "content" | "details" | "summary";

/** Title, link and name of a replaced order, offered again in the details step. */
export interface CarriedTexts {
  title: string | null;
  url: string | null;
  displayName: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown>,
  ) {
    super(code);
  }
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json", ...init.headers } : init.headers,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, typeof body.error === "string" ? body.error : "error", body);
  return body as T;
}

/** The step to continue with for an order that is still being edited. */
export function nextStep(order: OrderResponse): Step {
  if (!order.content) return "content";
  if (!order.content.title || !order.email || !order.periodYears || !order.termsAccepted || !order.waiver) return "details";
  return "summary";
}

export const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
