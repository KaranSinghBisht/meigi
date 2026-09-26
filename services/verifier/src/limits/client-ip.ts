import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { ipKey } from "./rate.js";

/**
 * The client a request is rate-limited as. Without a trusted proxy, the socket's address: forwarded headers are
 * attacker-controlled, so they only count when VERIFIER_TRUST_PROXY says a proxy we run sets them.
 */
export function clientIpOf(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0];
    if (forwarded?.trim()) return ipKey(forwarded);
  }
  try {
    const address = getConnInfo(c).remote.address;
    return address ? ipKey(address) : "unknown";
  } catch {
    return "unknown"; // no socket, e.g. app.request() in tests
  }
}
