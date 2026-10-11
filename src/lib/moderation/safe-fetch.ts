import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Following a renter's link to see where it really leads (redirect chains
 * are a common way to hide a bad page). The server only ever talks to public
 * internet addresses: every DNS answer is checked at connection time, so a
 * link cannot make us call internal services (SSRF), not even by changing
 * its DNS between the check and the request.
 */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

function inV4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return !PRIVATE_V4.some(([base, bits]) => inV4(ip, base, bits));
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]!);
    if (lower === "::" || lower === "::1") return false;
    // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast, 2001:db8::/32 documentation.
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff") || lower.startsWith("2001:db8:")) return false;
    return true;
  }
  return false;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function blocked(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error("Address not allowed");
  error.code = "EADDRNOTALLOWED";
  return error;
}

/** dns.lookup that refuses non-public addresses (used for the actual connection). */
function publicLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const allowed = addresses.filter((a) => isPublicAddress(a.address));
    if (!allowed.length) return callback(blocked(), []);
    if (options.all) return callback(null, allowed);
    callback(null, allowed[0]!.address, allowed[0]!.family);
  });
}

interface Hop {
  status: number;
  location: string | null;
}

function requestHead(url: URL, method: "HEAD" | "GET", timeoutMs: number): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method,
        lookup: publicLookup as unknown as net.LookupFunction,
        timeout: timeoutMs,
        headers: { "User-Agent": "MillionPixelWall-LinkCheck/1.0", Accept: "text/html,*/*;q=0.5" },
      },
      (res) => {
        resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null });
        res.destroy();
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
    req.end();
  });
}

export interface RedirectChain {
  /** Every address visited, the given one first. */
  urls: string[];
  finalUrl: string;
  status: number | null;
  error: string | null;
}

/** Follow up to `maxHops` redirects without downloading pages. */
export async function followRedirects(start: string, maxHops = 5, timeoutMs = 5000): Promise<RedirectChain> {
  const urls: string[] = [];
  let current: URL;
  try {
    current = new URL(start);
  } catch {
    return { urls: [start], finalUrl: start, status: null, error: "invalid_url" };
  }
  for (let hop = 0; hop <= maxHops; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      return { urls, finalUrl: current.toString(), status: null, error: "bad_protocol" };
    }
    urls.push(current.toString());
    let result: Hop;
    try {
      result = await requestHead(current, "HEAD", timeoutMs);
      if (result.status === 405 || result.status === 501) result = await requestHead(current, "GET", timeoutMs);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { urls, finalUrl: current.toString(), status: null, error: code === "EADDRNOTALLOWED" ? "private_address" : "unreachable" };
    }
    if (result.status >= 300 && result.status < 400 && result.location) {
      try {
        current = new URL(result.location, current);
      } catch {
        return { urls, finalUrl: current.toString(), status: result.status, error: "bad_redirect" };
      }
      continue;
    }
    return { urls, finalUrl: current.toString(), status: result.status, error: null };
  }
  return { urls, finalUrl: current.toString(), status: null, error: "too_many_redirects" };
}
