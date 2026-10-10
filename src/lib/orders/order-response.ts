import type { Sql } from "@/lib/db";
import { quote, type Quote } from "@/lib/pricing";
import type { Settings } from "@/lib/settings/schema";
import { orderState, type OrderState } from "./order";

export interface OrderResponse extends OrderState {
  /** Server-side prices for every offered period. */
  quotes: Quote[];
  /** Where the browser can fetch the current content PNG. */
  previewUrl: string | null;
}

export async function orderResponse(sql: Sql, settings: Settings, rental: Parameters<typeof orderState>[1]): Promise<OrderResponse> {
  const state = await orderState(sql, rental);
  const quotes = settings.periods
    .map((p) => quote(settings, state.rect.w, state.rect.h, p.years))
    .filter((q): q is Quote => q !== null);
  return {
    ...state,
    quotes,
    previewUrl: state.content ? `/api/rentals/${state.id}/content/${state.content.id}` : null,
  };
}
