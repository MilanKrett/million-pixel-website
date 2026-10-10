import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed, short-lived permissions for the local upload endpoint (development storage). */

const VALID_MS = 15 * 60_000;

function secret(): string {
  const s = process.env.CRON_SECRET;
  if (!s || s.length < 16) throw new Error("CRON_SECRET must be set (at least 16 characters).");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export interface UploadGrant {
  bucket: string;
  path: string;
  maxBytes: number;
  contentType: string;
}

export function signUpload(grant: UploadGrant, now = Date.now()): string {
  const exp = String(now + VALID_MS);
  const params = new URLSearchParams({ ...grant, maxBytes: String(grant.maxBytes), exp });
  params.set("sig", sign(params.toString()));
  return params.toString();
}

export function verifyUpload(query: URLSearchParams, now = Date.now()): UploadGrant | null {
  const sig = query.get("sig");
  if (!sig) return null;
  const unsigned = new URLSearchParams(query);
  unsigned.delete("sig");
  const expected = Buffer.from(sign(unsigned.toString()));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(unsigned.get("exp")) < now) return null;
  const maxBytes = Number(unsigned.get("maxBytes"));
  const bucket = unsigned.get("bucket");
  const path = unsigned.get("path");
  const contentType = unsigned.get("contentType");
  if (!bucket || !path || !contentType || !Number.isFinite(maxBytes)) return null;
  return { bucket, path, maxBytes, contentType };
}
