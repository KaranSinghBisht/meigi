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

/**
 * The primary's bench. `benched` wraps the first-choice copy: after a transport failure it answers at once with
 * Skipped for BENCH_MS. `lifting` wraps the last-resort copy of the same RPC: when that answers, the bench is lifted,
 * so a primary that is back doesn't wait behind a slow fallback for the rest of the minute.
 */
export function bench(url: string, now: () => number = Date.now) {
  let until = 0;
  const wrap = (transport: Transport, call: (inner: ReturnType<Transport>, args: Parameters<ReturnType<Transport>["request"]>) => Promise<unknown>): Transport => {
    return (params) => {
      const inner = transport(params);
      const request = ((...args: Parameters<typeof inner.request>) => call(inner, args)) as typeof inner.request;
      return { ...inner, request };
    };
  };
  return {
    benched: (transport: Transport) =>
      wrap(transport, async (inner, args) => {
        if (now() < until) throw new Skipped(url);
        try {
          return await inner.request(...args);
        } catch (error) {
          if (isTransportError(error)) until = now() + BENCH_MS;
          throw error;
        }
      }),
    lifting: (transport: Transport) =>
      wrap(transport, async (inner, args) => {
        const started = now();
        const answer = await inner.request(...args);
        if (now() - started < PRIMARY_TIMEOUT_MS) until = 0; // back, and quick: first choice again (a slow answer keeps the bench)
        return answer;
      }),
  };
}

/** Reads and simulations go through `transport`; `each` is every RPC on its own, in the same order, for broadcast.ts. */
export function rpcTransports(urls: readonly [string, ...string[]]): { transport: Transport; each: Transport[] } {
  const [primaryUrl, fallbackUrl] = urls;
  if (!fallbackUrl) {
    const only = http(primaryUrl, { timeout: 15_000 });
    return { transport: only, each: [only] };
  }
  const primary = bench(primaryUrl);
  const each = [
    primary.benched(http(primaryUrl, { timeout: PRIMARY_TIMEOUT_MS, retryCount: 0 })),
    http(fallbackUrl, { timeout: 8_000, retryCount: 0 }),
    primary.lifting(http(primaryUrl, { timeout: 8_000, retryCount: 0 })), // the last resort: the primary, even while benched
  ];
  return { transport: fallback(each, { retryCount: 0 }), each };
}
