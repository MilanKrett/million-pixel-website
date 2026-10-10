/**
 * Validate and normalise a renter's link. Only http(s) URLs to public host
 * names are accepted; everything else (javascript:, data:, credentials in the
 * URL, raw IPs, localhost) returns null.
 */
export function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 2048) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".") || host === "localhost" || host.endsWith(".localhost")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return null;
  if (!/^[a-z0-9.-]+$/.test(host) || host.split(".").some((label) => label.length === 0 || label.length > 63)) {
    return null;
  }
  url.hash = "";
  return url.toString();
}

/** Host name shown to visitors, e.g. "https://www.shop.example.com/x" → "shop.example.com". */
export function displayDomain(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
