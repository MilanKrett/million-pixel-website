/**
 * Cloudflare Turnstile (bot protection without puzzles) for starting an order,
 * asking for a sign-in link and reporting content. Without keys (local
 * development) every request passes.
 */

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY ? process.env.TURNSTILE_SITE_KEY : null;
}

export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.TURNSTILE_SITE_KEY) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    // Cloudflare unreachable: let people through (the request limits still apply)
    // rather than lock everyone out.
    console.error("[turnstile] verification unavailable:", error);
    return true;
  }
}
