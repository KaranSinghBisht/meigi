import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { isIP } from "node:net";
import { ipKey } from "./rate.js";

/**
 * The client a request is rate-limited as. By default the socket's address: forwarded headers are set by the client
 * unless a proxy we run overwrites them. With `trustProxy` (one proxy of ours in front, e.g. cloudflared or nginx),
 * the rightmost X-Forwarded-For entry is the address that proxy saw. Entries further left are whatever the client
 * sent, so they never count.
 */
export function clientIpOf(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const hops = (c.req.header("x-forwarded-for") ?? "").split(",").map((hop) => hop.trim());
    const nearest = hops.at(-1);
    if (nearest && isIP(nearest)) return ipKey(nearest);
  }
  try {
    const address = getConnInfo(c).remote.address;
    if (address && isIP(address)) return ipKey(address);
  } catch {
    // no socket, e.g. app.request() in tests
  }
  return "unknown";
}
