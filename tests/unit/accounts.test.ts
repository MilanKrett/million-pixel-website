import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/auth/accounts";
import { safeNextPath } from "@/lib/auth/login";
import { hasFreshMfa, parseSessionToken, type SessionInfo } from "@/lib/auth/session";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  otpauthUri,
  timeStep,
  totpCode,
  verifyTotp,
} from "@/lib/auth/totp";

describe("two-factor codes (RFC 6238)", () => {
  // Test vector from RFC 6238: ASCII "12345678901234567890", SHA-1.
  const secret = base32Encode(Buffer.from("12345678901234567890"));

  it("matches the official test vectors", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    // 8-digit values from the RFC, last 6 digits.
    expect(totpCode(secret, timeStep(59_000))).toBe("287082");
    expect(totpCode(secret, timeStep(1_111_111_109_000))).toBe("081804");
    expect(totpCode(secret, timeStep(2_000_000_000_000))).toBe("279037");
  });

  it("accepts one step of clock difference, never the same code twice", () => {
    const now = 1_700_000_000_000;
    const step = timeStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), null, now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), null, now)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
    expect(verifyTotp(secret, `${totpCode(secret, step).slice(0, 3)} ${totpCode(secret, step).slice(3)}`, null, now)).toBe(step);
  });

  it("encodes base32 both ways and makes unique secrets", () => {
    const data = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(data))).toEqual(data);
    expect(generateSecret()).not.toBe(generateSecret());
    expect(otpauthUri("ABC", "a@b.sk", "Million Pixel Wall")).toMatch(/^otpauth:\/\/totp\/Million%20Pixel%20Wall%3Aa%40b\.sk\?secret=ABC&issuer=/);
  });

  it("stores the secret encrypted and notices tampering", () => {
    process.env.AUTH_SECRET = "unit-test-secret-0123456789-abcdefghijkl";
    const stored = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(stored).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(stored)).toBe("JBSWY3DPEHPK3PXP");
    const parts = stored.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("makes recovery codes that compare loosely", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(hashRecoveryCode(codes[0]!.toUpperCase().replace("-", " "))).toBe(hashRecoveryCode(codes[0]!));
  });
});

describe("sign-in helpers", () => {
  it("only follows paths on this site after sign-in", () => {
    expect(safeNextPath("/my-pixels")).toBe("/my-pixels");
    expect(safeNextPath("/sk/my-pixels?x=1")).toBe("/sk/my-pixels?x=1");
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath(42)).toBeNull();
  });

  it("normalises e-mail addresses", () => {
    expect(normalizeEmail("  Jana@Example.COM ")).toBe("jana@example.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("accepts only well-formed session cookies", () => {
    expect(parseSessionToken("a".repeat(43))).toBe("a".repeat(43));
    expect(parseSessionToken("short")).toBeNull();
    expect(parseSessionToken("../../etc/passwd" + "a".repeat(40))).toBeNull();
  });

  it("asks staff for the second factor again after 12 hours", () => {
    const session = { mfaAt: new Date(1_000_000) } as SessionInfo;
    expect(hasFreshMfa(session, 1_000_000 + 11 * 3600_000)).toBe(true);
    expect(hasFreshMfa(session, 1_000_000 + 13 * 3600_000)).toBe(false);
    expect(hasFreshMfa({ mfaAt: null } as SessionInfo)).toBe(false);
  });
});
