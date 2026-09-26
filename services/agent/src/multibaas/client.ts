import { z } from "zod";

/**
 * A small MultiBaas (Curvegrid) REST client: `https://<deployment>.multibaas.com/api/v0`, Bearer API key. Only the
 * calls Meigi uses. The key is sent to MULTIBAAS_URL and nowhere else (no redirects), and every call is bounded
 * by a timeout. Failures throw MultiBaasUnavailable so callers fall back to plain RPC.
 */

export interface MultiBaasOptions {
  url: string; // https://<deployment>.multibaas.com
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * MultiBaas couldn't be reached, timed out, or answered with an error or an unexpected body. `detail` is MultiBaas's
 * own error text: for the operator (the setup script), never for API responses.
 */
export class MultiBaasUnavailable extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = "MultiBaasUnavailable";
  }
}

const envelope = z.object({ status: z.number(), message: z.string().optional(), result: z.unknown().optional() }); // errors carry no result

const eventField = z.object({ name: z.string(), value: z.unknown(), type: z.string().optional() });
const indexedEvent = z.object({
  triggeredAt: z.string(),
  event: z.object({
    name: z.string(),
    signature: z.string(),
    inputs: z.array(eventField),
    contract: z.object({ address: z.string(), label: z.string().optional() }).passthrough(),
  }),
  transaction: z.object({ txHash: z.string(), blockNumber: z.number() }).passthrough(),
});

export type IndexedEvent = z.infer<typeof indexedEvent>;

export interface EventFilter {
  contractLabel?: string;
  contractAddress?: string;
  eventSignature?: string;
  txHash?: string;
  limit?: number;
  offset?: number;
}

export interface MultiBaas {
  /** GET /events: indexed events, newest last as MultiBaas returns them. */
  events(filter: EventFilter): Promise<IndexedEvent[]>;
  /** POST /queries: runs an event query (the same definitions the setup script saves). Row keys are lowercase aliases. */
  query(definition: unknown, limit?: number): Promise<Record<string, unknown>[]>;
  /** GET /queries/{name}/results: a query the setup script saved, for those whose filters name a deployment's addresses. */
  saved(name: string, limit?: number): Promise<Record<string, unknown>[]>;
  /** Any other call (the setup script): returns the envelope's `result`. */
  call(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<unknown>;
  /** The chain the deployment serves: a deployment's network is fixed when it is created. */
  chainId(): Promise<number>;
  /** Throws unless the deployment serves `chainId`. */
  requireChain(chainId: number): Promise<void>;
}

export function createMultiBaas(opts: MultiBaasOptions): MultiBaas {
  const base = `${opts.url.replace(/\/+$/u, "")}/api/v0`;
  const call = (method: "GET" | "POST" | "PUT", path: string, body?: unknown) => request(opts, base, method, path, body);
  return {
    async events(filter) {
      const query = new URLSearchParams();
      const params: [string, string | number | undefined][] = [
        ["contract_label", filter.contractLabel],
        ["contract_address", filter.contractAddress],
        ["event_signature", filter.eventSignature],
        ["tx_hash", filter.txHash],
        ["limit", filter.limit],
        ["offset", filter.offset],
      ];
      for (const [key, value] of params) if (value !== undefined) query.set(key, String(value));
      const parsed = z.array(indexedEvent).safeParse(await call("GET", `/events?${query}`));
      if (!parsed.success) throw new MultiBaasUnavailable("MultiBaas returned events in an unexpected shape");
      return parsed.data;
    },
    async query(definition, limit = 100) {
      return rowsOf(await call("POST", `/queries?offset=0&limit=${limit}`, definition));
    },
    async saved(name, limit = 50) {
      if (!/^[a-z0-9_]+$/u.test(name)) throw new MultiBaasUnavailable("not a saved query name");
      return rowsOf(await call("GET", `/queries/${name}/results?limit=${limit}`));
    },
    call,
    chainId: () => servedChain(call),
    async requireChain(chainId) {
      const served = await servedChain(call);
      if (served !== chainId) throw new MultiBaasUnavailable(`the MultiBaas deployment is on chain ${served}, not ${chainId}`);
    },
  };
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  const parsed = z.object({ rows: z.array(z.record(z.string(), z.unknown())) }).safeParse(result);
  if (!parsed.success) throw new MultiBaasUnavailable("MultiBaas returned query results in an unexpected shape");
  return parsed.data.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value])));
}

async function servedChain(call: (method: "GET", path: string) => Promise<unknown>): Promise<number> {
  const status = z.object({ chainID: z.number() }).safeParse(await call("GET", "/chains/ethereum/status"));
  if (!status.success) throw new MultiBaasUnavailable("MultiBaas returned its chain status in an unexpected shape");
  return status.data.chainID;
}

async function request(opts: MultiBaasOptions, base: string, method: string, path: string, body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await (opts.fetch ?? fetch)(`${base}${path}`, {
      method,
      redirect: "error",
      headers: { authorization: `Bearer ${opts.apiKey}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new MultiBaasUnavailable(timedOut ? "MultiBaas did not answer in time" : "could not reach MultiBaas");
  }
  const parsed = envelope.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) {
    const detail = parsed.success && parsed.data.message ? parsed.data.message.slice(0, 300) : null;
    throw new MultiBaasUnavailable(`MultiBaas answered ${response.status}`, response.status, detail);
  }
  return parsed.data.result;
}
