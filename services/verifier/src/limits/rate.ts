import { HttpError } from "../http.js";

const HOUR = 3600;
const MAX_KEYS = 10_000; // bounds memory under a flood of distinct clients

/** Thrown as 429 `rate_limited`; `retryAfter` (seconds) also goes out as a Retry-After header. */
export class RateLimitError extends HttpError {
  constructor(readonly retryAfter: number) {
    super(429, "rate_limited", `too many requests from this client; try again in ${retryAfter}s`, {
      "Retry-After": String(retryAfter),
    });
  }
}

/**
 * In-memory sliding-window limits per (bucket, client). Per process, so a restart forgets them. That is fine for one
 * verifier; behind several instances, move this to shared storage.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Records one request at `now` (unix seconds), or throws RateLimitError if `perHour` were exceeded. */
  hit(bucket: string, client: string, perHour: number, now: number): void {
    if (perHour <= 0) return;
    const key = `${bucket}|${client}`;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - HOUR);
    if (recent.length >= perHour) {
      this.hits.set(key, recent);
      throw new RateLimitError(Math.max(1, recent[0]! + HOUR - now));
    }
    recent.push(now);
    this.hits.delete(key); // re-insert, so Map order tracks recency for eviction
    this.hits.set(key, recent);
    if (this.hits.size > MAX_KEYS) this.hits.delete(this.hits.keys().next().value!);
  }
}

/**
 * The key an address is limited under: IPv4 as is, IPv6 by its /64 (one subscriber usually holds a whole /64), and
 * IPv4-mapped IPv6 as the IPv4 address.
 */
export function ipKey(address: string): string {
  const ip = address.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/u, "")).join(":")}::/64`;
}
