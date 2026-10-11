import type { NextRequest } from "next/server";
import { isStaff } from "@/lib/auth/accounts";
import { sessionFromRequest } from "@/lib/auth/current";
import { hasFreshMfa, type SessionInfo } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError, readOrderCookie } from "@/lib/http";
import { findOrder, isEditable, isOwnerEditable, loadRental, type RentalRow } from "./order";

/**
 * The rental an order request is about, if this browser owns it (order
 * cookie) — otherwise an error response to return as is.
 */
export async function authorizeOrder(
  request: NextRequest,
  id: string,
  options: { mutate?: boolean; editable?: boolean } = {},
): Promise<{ rental: RentalRow } | { error: Response }> {
  if (options.mutate && !isSameOrigin(request)) return { error: jsonError(403, "forbidden") };
  const cookie = readOrderCookie(request);
  if (!cookie || cookie.id !== id) return { error: jsonError(404, "not_found") };
  const rental = await findOrder(db(), id, cookie.token);
  if (!rental) return { error: jsonError(404, "not_found") };
  if (options.editable && !isEditable(rental)) return { error: jsonError(409, "expired") };
  return { rental };
}

/**
 * Who may work with a rental's content:
 *  - "order": the browser in the middle of ordering it (order cookie),
 *  - "owner": the signed-in account it belongs to (My pixels),
 *  - "staff": a moderator or admin with two-factor login (admins may also edit).
 */
export type RentalAccess = "order" | "owner" | "staff";

export async function authorizeRental(
  request: NextRequest,
  id: string,
  options: { mutate?: boolean; editable?: boolean; staff?: boolean } = {},
): Promise<{ rental: RentalRow; access: RentalAccess; session: SessionInfo | null } | { error: Response }> {
  if (options.mutate && !isSameOrigin(request)) return { error: jsonError(403, "forbidden") };

  // The owner's account comes first: the same browser may still hold the
  // cookie of the order it paid for.
  const session = await sessionFromRequest(request);
  const loaded = session ? await loadRental(db(), id) : null;
  if (session && loaded && loaded.user_id === session.user.id) {
    if (options.editable && !isOwnerEditable(loaded)) return { error: jsonError(409, "not_editable") };
    return { rental: loaded, access: "owner", session };
  }

  const cookie = readOrderCookie(request);
  if (cookie && cookie.id === id) {
    const rental = await findOrder(db(), id, cookie.token);
    if (rental && (isEditable(rental) || !options.editable)) return { rental, access: "order", session: null };
  }

  if (!session || !loaded) return { error: jsonError(404, "not_found") };
  const rental = loaded;
  if (options.staff && isStaff(session.user.role) && session.user.totp_enabled_at && hasFreshMfa(session)) {
    // Moderators look; only admins change content on the renter's behalf.
    if (options.editable && session.user.role !== "admin") return { error: jsonError(403, "forbidden") };
    return { rental, access: "staff", session };
  }
  return { error: jsonError(404, "not_found") };
}
