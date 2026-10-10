import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError, readOrderCookie } from "@/lib/http";
import { findOrder, isEditable } from "./order";

type Rental = NonNullable<Awaited<ReturnType<typeof findOrder>>>;

/**
 * The rental an order request is about, if this browser owns it (order
 * cookie) — otherwise an error response to return as is.
 */
export async function authorizeOrder(
  request: NextRequest,
  id: string,
  options: { mutate?: boolean; editable?: boolean } = {},
): Promise<{ rental: Rental } | { error: Response }> {
  if (options.mutate && !isSameOrigin(request)) return { error: jsonError(403, "forbidden") };
  const cookie = readOrderCookie(request);
  if (!cookie || cookie.id !== id) return { error: jsonError(404, "not_found") };
  const rental = await findOrder(db(), id, cookie.token);
  if (!rental) return { error: jsonError(404, "not_found") };
  if (options.editable && !isEditable(rental)) return { error: jsonError(409, "expired") };
  return { rental };
}
