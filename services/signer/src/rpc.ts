import { BaseError, fallback, http, HttpRequestError, TimeoutError, type Transport } from "viem";

/**
 * The signer's RPC transports. With SEPOLIA_RPC_FALLBACK_URL set, the primary gets one try of PRIMARY_TIMEOUT_MS and
 * a primary that fails at the transport level (a hang, a refused connection, an HTTP error such as a Cloudflare 403)
 * is skipped for BENCH_MS, so a hung RPC costs one timeout, not one per call. The fallback comes next, and the primary
 * again last, benched or not, so the fallback is never the only way to the chain.
 */

export const PRIMARY_TIMEOUT_MS = 4_000;
export const BENCH_MS = 60_000;

/** A timeout, a refused connection or an HTTP error: the RPC failed, not the transaction. */
export function isTransportError(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  return error.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError) !== null;
}

/** What a benched primary answers: a transport error, so the next RPC is tried, for a call that never left here. */
export class Skipped extends HttpRequestError {
  constructor(url: string) {
    super({ url, details: "skipped: it failed within the last minute" });
  }
}

export function wasSkipped(error: unknown): boolean {
  return error instanceof BaseError && error.walk((e) => e instanceof Skipped) !== null;
}

/** The primary: while benched after a transport failure it answers at once with Skipped. */
export function benched(url: string, transport: Transport, now: () => number = Date.now): Transport {
  let until = 0;
  return (params) => {
    const inner = transport(params);
    const request = (async (args: Parameters<typeof inner.request>[0]) => {
      if (now() < until) throw new Skipped(url);
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

/** Reads and simulations go through `transport`; `each` is every RPC on its own, in the same order, for broadcast.ts. */
export function rpcTransports(urls: readonly [string, ...string[]]): { transport: Transport; each: Transport[] } {
  const [primaryUrl, fallbackUrl] = urls;
  if (!fallbackUrl) {
    const only = http(primaryUrl, { timeout: 15_000 });
    return { transport: only, each: [only] };
  }
  const each = [
    benched(primaryUrl, http(primaryUrl, { timeout: PRIMARY_TIMEOUT_MS, retryCount: 0 })),
    http(fallbackUrl, { timeout: 8_000, retryCount: 0 }),
    http(primaryUrl, { timeout: 8_000, retryCount: 0 }), // the last resort: the primary, even while benched
  ];
  return { transport: fallback(each, { retryCount: 0 }), each };
}
