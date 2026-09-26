import { BaseError, createPublicClient, fallback, http, HttpRequestError, TimeoutError, type Chain, type PublicClient, type Transport } from "viem";
import { foundry, sepolia } from "viem/chains";

export function chainFor(chainId: number): Chain {
  if (chainId === sepolia.id) return sepolia;
  if (chainId === foundry.id) return foundry;
  throw new Error(`unsupported chain id ${chainId}`);
}

/** With a fallback URL, the primary gets one try of this long, and is skipped for BENCH_MS after a transport failure. */
export const PRIMARY_TIMEOUT_MS = 4_000;
export const BENCH_MS = 60_000;

/** A timeout, a refused connection or an HTTP error (a Cloudflare 403, say): the RPC failed, not the call. */
function isTransportError(error: unknown): boolean {
  return error instanceof BaseError && error.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError) !== null;
}

/**
 * The primary RPC's bench. `benched` wraps the first-choice copy: after a transport failure it answers at once with one
 * for BENCH_MS, so the fallback takes over and a hung RPC costs one timeout, not one per read. `lifting` wraps the
 * last-resort copy: when that answers, the bench is lifted. The same logic guards the signer
 * (services/signer/src/rpc.ts); the agent doesn't import the signer's code.
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
        if (now() < until) throw new HttpRequestError({ url, details: "skipped: it failed within the last minute" });
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

/**
 * The JSON-RPC transport, batched so a snapshot's reads share a round trip. With a fallback URL, a read that fails or
 * hangs on the primary (a timeout, a connection error, an HTTP error such as a Cloudflare 403) moves to the fallback
 * within PRIMARY_TIMEOUT_MS, and the primary is skipped for a minute after. The primary is tried again last, benched or
 * not, so the fallback is never the only way to the chain.
 */
export function rpcTransport(rpcUrl: string, fallbackUrl?: string): Transport {
  if (!fallbackUrl) return http(rpcUrl, { batch: true, timeout: 15_000 });
  const primary = bench(rpcUrl);
  return fallback(
    [
      primary.benched(http(rpcUrl, { batch: true, timeout: PRIMARY_TIMEOUT_MS, retryCount: 0 })),
      http(fallbackUrl, { batch: true, timeout: 8_000, retryCount: 0 }),
      primary.lifting(http(rpcUrl, { batch: true, timeout: 8_000, retryCount: 0 })), // the last resort: the primary, even while benched
    ],
    { retryCount: 0 },
  );
}

/** Read-only: the agent has no wallet. */
export function createClients(rpcUrl: string, chainId: number, fallbackUrl?: string) {
  const chain = chainFor(chainId);
  const publicClient = createPublicClient({ chain, transport: rpcTransport(rpcUrl, fallbackUrl) }) as PublicClient;
  return { chain, publicClient };
}
