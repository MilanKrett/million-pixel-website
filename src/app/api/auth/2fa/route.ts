import type { NextRequest } from "next/server";
import { isStaff } from "@/lib/auth/accounts";
import { sessionFromRequest } from "@/lib/auth/current";
import { enableTotp, verifySecondFactor } from "@/lib/auth/mfa";
import { db } from "@/lib/db";
import { isSameOrigin, jsonError, noStoreJson } from "@/lib/http";

/**
 * Staff second factor. {action: "enable", code} finishes the setup and returns
 * the recovery codes once; {action: "verify", code} confirms this session.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden");
  const session = await sessionFromRequest(request);
  if (!session || !isStaff(session.user.role)) return jsonError(401, "unauthorized");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid");
  }
  if (body.action === "enable") {
    const result = await enableTotp(db(), session, body.code);
    if (!result.ok) return jsonError(result.reason === "rate_limited" ? 429 : 400, result.reason);
    return noStoreJson({ recoveryCodes: result.recoveryCodes });
  }
  if (body.action === "verify") {
    const result = await verifySecondFactor(db(), session, body.code);
    if (!result.ok) return jsonError(result.reason === "rate_limited" ? 429 : 400, result.reason);
    return noStoreJson({ ok: true });
  }
  return jsonError(400, "invalid");
}
