/**
 * Outside services for the automatic checks. Each one is optional: without
 * its keys the check reports "skipped" and the moderator decides alone.
 *
 *   LINK_CHECK_PROVIDER=webrisk       Google Web Risk (for commercial sites)   GOOGLE_WEB_RISK_API_KEY
 *   LINK_CHECK_PROVIDER=safebrowsing  Google Safe Browsing (non-commercial)    GOOGLE_SAFE_BROWSING_API_KEY
 *   IMAGE_MODERATION_PROVIDER=sightengine                                       SIGHTENGINE_API_USER, SIGHTENGINE_API_SECRET
 *   IMAGE_MODERATION_PROVIDER=google  Google Cloud Vision SafeSearch            GOOGLE_VISION_API_KEY
 */

export type CheckStatus = "ok" | "flagged" | "error" | "skipped";

export interface LinkReputation {
  provider: string;
  status: CheckStatus;
  threats: string[];
  error?: string;
}

export interface ImageVerdict {
  provider: string;
  status: CheckStatus;
  /** 0–1, higher = more likely. */
  scores: Record<string, number>;
  error?: string;
}

const THREATS = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"];
/** Image scores at or above this are shown to the moderator as a warning. */
export const IMAGE_FLAG_SCORE = 0.5;

type Fetch = typeof fetch;

export function linkCheckProvider(): string {
  return process.env.LINK_CHECK_PROVIDER ?? "none";
}

/** Look every address of a redirect chain up in Google's lists of dangerous sites. */
export async function checkLinkReputation(urls: string[], doFetch: Fetch = fetch): Promise<LinkReputation> {
  const provider = linkCheckProvider();
  try {
    if (provider === "webrisk") {
      const key = process.env.GOOGLE_WEB_RISK_API_KEY;
      if (!key) return { provider, status: "skipped", threats: [], error: "no_key" };
      const threats = new Set<string>();
      for (const uri of urls) {
        const params = new URLSearchParams({ uri, key });
        for (const t of THREATS) params.append("threatTypes", t);
        const res = await doFetch(`https://webrisk.googleapis.com/v1/uris:search?${params}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`Web Risk ${res.status}`);
        const body = (await res.json()) as { threat?: { threatTypes?: string[] } };
        for (const t of body.threat?.threatTypes ?? []) threats.add(t);
      }
      return { provider, status: threats.size ? "flagged" : "ok", threats: [...threats] };
    }
    if (provider === "safebrowsing") {
      const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
      if (!key) return { provider, status: "skipped", threats: [], error: "no_key" };
      const res = await doFetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "million-pixel-wall", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: THREATS,
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: urls.map((url) => ({ url })),
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Safe Browsing ${res.status}`);
      const body = (await res.json()) as { matches?: { threatType: string }[] };
      const threats = [...new Set((body.matches ?? []).map((m) => m.threatType))];
      return { provider, status: threats.length ? "flagged" : "ok", threats };
    }
    return { provider: "none", status: "skipped", threats: [] };
  } catch (error) {
    return { provider, status: "error", threats: [], error: error instanceof Error ? error.message : String(error) };
  }
}

const LIKELIHOOD: Record<string, number> = { UNKNOWN: 0, VERY_UNLIKELY: 0, UNLIKELY: 0.2, POSSIBLE: 0.5, LIKELY: 0.8, VERY_LIKELY: 0.95 };

/** Ask an image-recognition service how likely the picture is nudity, violence, etc. */
export async function checkImage(image: Buffer, contentType: string, doFetch: Fetch = fetch): Promise<ImageVerdict> {
  const provider = process.env.IMAGE_MODERATION_PROVIDER ?? "none";
  try {
    if (provider === "sightengine") {
      const user = process.env.SIGHTENGINE_API_USER;
      const secret = process.env.SIGHTENGINE_API_SECRET;
      if (!user || !secret) return { provider, status: "skipped", scores: {}, error: "no_key" };
      const form = new FormData();
      form.set("media", new Blob([new Uint8Array(image)], { type: contentType }), "image");
      form.set("models", "nudity-2.1,weapon,gore-2.0,offensive-2.0,recreational_drug");
      form.set("api_user", user);
      form.set("api_secret", secret);
      const res = await doFetch("https://api.sightengine.com/1.0/check.json", { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
      const body = (await res.json()) as SightengineResponse;
      if (!res.ok || body.status !== "success") throw new Error(body.error?.message ?? `Sightengine ${res.status}`);
      const scores = sightengineScores(body);
      return { provider, status: flagged(scores), scores };
    }
    if (provider === "google") {
      const key = process.env.GOOGLE_VISION_API_KEY;
      if (!key) return { provider, status: "skipped", scores: {}, error: "no_key" };
      const res = await doFetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ image: { content: image.toString("base64") }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }] }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Vision ${res.status}`);
      const body = (await res.json()) as { responses?: { safeSearchAnnotation?: Record<string, string>; error?: { message: string } }[] };
      const answer = body.responses?.[0];
      if (answer?.error) throw new Error(answer.error.message);
      const a = answer?.safeSearchAnnotation ?? {};
      const scores = {
        sexual: LIKELIHOOD[a.adult ?? "UNKNOWN"] ?? 0,
        suggestive: LIKELIHOOD[a.racy ?? "UNKNOWN"] ?? 0,
        violence: LIKELIHOOD[a.violence ?? "UNKNOWN"] ?? 0,
        medical: LIKELIHOOD[a.medical ?? "UNKNOWN"] ?? 0,
      };
      return { provider, status: flagged(scores), scores };
    }
    return { provider: "none", status: "skipped", scores: {} };
  } catch (error) {
    return { provider, status: "error", scores: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

interface SightengineResponse {
  status?: string;
  error?: { message?: string };
  nudity?: Record<string, unknown>;
  weapon?: { classes?: Record<string, number> };
  gore?: { prob?: number };
  offensive?: Record<string, number>;
  recreational_drug?: { prob?: number };
}

export function sightengineScores(body: SightengineResponse): Record<string, number> {
  const n = body.nudity ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const offensive = Object.values(body.offensive ?? {}).reduce<number>((m, v) => Math.max(m, num(v)), 0);
  return {
    sexual: Math.max(num(n.sexual_activity), num(n.sexual_display), num(n.erotica)),
    suggestive: num(n.very_suggestive),
    weapon: Math.max(0, ...Object.values(body.weapon?.classes ?? {}).map(num)),
    violence: num(body.gore?.prob),
    hate: offensive,
    drugs: num(body.recreational_drug?.prob),
  };
}

function flagged(scores: Record<string, number>): CheckStatus {
  return Object.values(scores).some((s) => s >= IMAGE_FLAG_SCORE) ? "flagged" : "ok";
}
