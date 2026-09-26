import { fallback, http, HttpRequestError, type Transport } from "viem";
import { isTransportError } from "./broadcast.js";

/**
 * The verifier's RPC transports. With SEPOLIA_RPC_FALLBACK_URL set, the primary gets one try of PRIMARY_TIMEOUT_MS
 * and a primary that fails at the transport level (a hang, a refused connection, an HTTP error such as a Cloudflare
 * 403) is skipped for BENCH_MS, so a hung RPC costs one timeout, not one per call. The fallback keeps a normal
 * timeout.
 *
 * Mirrors services/signer/src/rpc.ts (copied rather than imported cross-package, to keep this scoped under a
 * time box) so the two behave the same.
 */

export const PRIMARY_TIMEOUT_MS = 4_000;
export const BENCH_MS = 60_000;

/** The primary: while benched after a transport failure it answers at once with one, so the fallback takes over. */
export function benched(url: string, transport: Transport, now: () => number = Date.now): Transport {
  let until = 0;
  return (params) => {
    const inner = transport(params);
    const request = (async (args: Parameters<typeof inner.request>[0]) => {
      if (now() < until) throw new HttpRequestError({ url, details: "skipped: it failed within the last minute" });
      try {
        return await inner.request(args);
      } catch (error) {
        if (isTransportError(error)) until = now() + BENCH_MS;
        throw error;
      }
    }) as typeof inner.request;
    return { ...inner, request };
  };
}

/** Reads and simulations go through `transport`; `each` is every RPC on its own, for broadcast.ts. */
export function rpcTransports(urls: readonly [string, ...string[]]): { transport: Transport; each: Transport[] } {
  const [primaryUrl, fallbackUrl] = urls;
  if (!fallbackUrl) {
    const only = http(primaryUrl, { timeout: 15_000 });
    return { transport: only, each: [only] };
  }
  const primary = benched(primaryUrl, http(primaryUrl, { timeout: PRIMARY_TIMEOUT_MS, retryCount: 0 }));
  const backup = http(fallbackUrl, { timeout: 8_000, retryCount: 1 });
  return { transport: fallback([primary, backup], { retryCount: 0 }), each: [primary, backup] };
}
