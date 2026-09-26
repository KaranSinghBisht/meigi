import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A stub MultiBaas deployment on 127.0.0.1: the /api/v0 calls Meigi makes, an in-memory library, aliases, links
 * and indexed events. `down` makes every call answer 503. Every request must carry the Bearer key.
 */

export const STUB_KEY = "mb_test_key_0123456789abcdef";

export interface StubEvent {
  txHash: string;
  block: number;
  at: string;
  inputs: { tNumber: string; payout: string; amount: string; invoiceRef: string };
}

export interface StubPayee {
  tNumber: string;
  payout: string;
  legalName: string;
  block: number;
  at: string;
  txHash: string;
}

export interface StubMultiBaas {
  url: string;
  down: boolean;
  chainId: number; // what GET /chains/ethereum/status reports
  shallowPlan: boolean; // refuse an absolute startingBlock, like a plan that caps past-log depth
  requests: { method: string; path: string; body: unknown }[];
  contracts: Map<string, Record<string, unknown>>;
  aliases: Map<string, { address: string; links: Record<string, unknown>[] }>;
  queries: Map<string, unknown>;
  verified: Map<string, string>; // address → the ABI (JSON) its contract lookup returns as verified
  invoicesPaid: StubEvent[];
  routerPaid: StubEvent[];
  payees: StubPayee[];
  received: { payout: string; total: string }[];
  token: { symbol: string; decimals: number };
  linkStart: number | null; // where every link's event indexing starts; null: nothing linked
  tokenAliased: boolean; // false: the token's alias doesn't exist yet (before a deploy is linked)
  close(): void;
}

const ok = (result: unknown) => ({ status: 200, message: "success", result });
const notFound = { status: 404, message: "not found" };

export async function startStubMultiBaas(): Promise<StubMultiBaas> {
  const stub = {
    down: false,
    chainId: 11155111,
    shallowPlan: false,
    requests: [],
    contracts: new Map(),
    aliases: new Map(),
    queries: new Map(),
    verified: new Map(),
    invoicesPaid: [],
    routerPaid: [],
    payees: [],
    received: [],
    token: { symbol: "mJPYC", decimals: 18 },
    linkStart: null,
    tokenAliased: true,
  } as unknown as StubMultiBaas;
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://stub");
      const body = raw ? JSON.parse(raw) : undefined;
      stub.requests.push({ method: req.method ?? "", path: `${url.pathname}${url.search}`, body });
      const [status, payload] = route(stub, req.method ?? "", url, body, req.headers.authorization);
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(payload));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stub.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  stub.close = () => {
    server.closeAllConnections();
    server.close();
  };
  return stub;
}

function route(stub: StubMultiBaas, method: string, url: URL, body: any, auth: string | undefined): [number, unknown] {
  if (auth !== `Bearer ${STUB_KEY}`) return [401, { status: 401, message: "unauthorized" }];
  if (stub.down) return [503, { status: 503, message: "unavailable" }];
  const path = url.pathname.replace(/^\/api\/v0/u, "");
  if (method === "GET" && path === "/chains/ethereum/status") return [200, ok({ chainID: stub.chainId, blockNumber: 11783500 })];
  const alias = /^\/chains\/ethereum\/addresses\/([^/]+)$/u.exec(path)?.[1];
  const link = /^\/chains\/ethereum\/addresses\/([^/]+)\/contracts$/u.exec(path)?.[1];
  const contract = /^\/contracts\/([^/]+)$/u.exec(path)?.[1];
  const query = /^\/queries\/([^/]+)$/u.exec(path)?.[1];
  if (method === "GET" && alias?.startsWith("0x") && url.searchParams.get("include") === "contractLookup") {
    const abi = stub.verified.get(alias);
    const lookup = abi ? [{ address: alias, abi, verified: true }] : [];
    return [200, ok({ alias: "", address: alias, chain: "ethereum", contracts: [], contractLookup: lookup })];
  }
  const status = /^\/chains\/ethereum\/addresses\/([^/]+)\/contracts\/([^/]+)\/status$/u.exec(path);
  if (method === "GET" && status) {
    if (stub.linkStart === null) return [404, notFound];
    return [200, ok({ startBlockNumber: stub.linkStart, latestBlockNumber: 11783999, isProcessingPastLogs: false })];
  }
  const read = /^\/chains\/ethereum\/addresses\/meigi_mjpy\/contracts\/meigi_jpy_token\/methods\/(symbol|decimals)$/u.exec(path)?.[1];
  if (method === "POST" && read) {
    if (!stub.tokenAliased) return [400, { status: 400, message: "invalid address" }]; // what MultiBaas says for an unknown alias
    return [200, ok({ kind: "MethodCallResponse", output: read === "symbol" ? stub.token.symbol : stub.token.decimals })];
  }
  if (method === "GET" && alias) {
    const entry = stub.aliases.get(alias);
    return entry ? [200, ok({ alias, address: entry.address, chain: "ethereum", contracts: entry.links })] : [404, notFound];
  }
  if (method === "POST" && path === "/chains/ethereum/addresses") {
    stub.aliases.set(body.alias, { address: body.address, links: [] });
    return [200, ok(body)];
  }
  if (method === "POST" && link) {
    if (stub.shallowPlan && !String(body.startingBlock).startsWith("-")) return [400, { status: 400, message: "starting block too far back" }];
    stub.aliases.get(link)?.links.push({ label: body.label, name: body.label, version: body.version, startingBlock: body.startingBlock });
    return [200, ok({})];
  }
  if (method === "GET" && contract) return stub.contracts.has(contract) ? [200, ok(stub.contracts.get(contract))] : [404, notFound];
  if (method === "POST" && contract) {
    if (typeof body.bin !== "string") return [400, { status: 400, message: 'null value in column "bytecode" violates not-null constraint' }];
    stub.contracts.set(contract, body);
    return [200, ok(body)];
  }
  if (method === "PUT" && query) {
    stub.queries.set(query, body);
    return [200, ok(body)];
  }
  if (method === "POST" && path === "/queries") return [200, ok({ rows: rowsFor(stub, body) })];
  const saved = /^\/queries\/([^/]+)\/results$/u.exec(path)?.[1];
  if (method === "GET" && saved) {
    const eventName = SAVED_EVENTS[saved];
    return eventName ? [200, ok({ rows: rowsFor(stub, { events: [{ eventName, select: [] }] }) })] : [404, notFound];
  }
  if (method === "GET" && path === "/events") return [200, ok(eventsFor(stub, url.searchParams))];
  return [404, notFound];
}

/** The event each saved query reads, for GET /queries/{name}/results. */
const SAVED_EVENTS: Record<string, string> = {
  meigi_invoices_paid: "InvoicePaid",
  meigi_router_paid: "Paid",
  meigi_payees_registered: "PayeeRegistered",
  meigi_mjpy_received: "Transfer",
};

function rowsFor(stub: StubMultiBaas, definition: { events: { eventName: string; select: { aggregator?: string }[] }[] }) {
  const event = definition.events[0]!;
  if (event.eventName === "Transfer") return stub.received.map((r) => ({ payout: r.payout, total: r.total }));
  if (event.eventName === "PayeeRegistered") {
    return [...stub.payees].sort((a, b) => b.block - a.block).map((p) => ({ tNumber: p.tNumber, payout: p.payout, legalName: p.legalName, block: p.block, at: p.at, txHash: p.txHash }));
  }
  return [...(event.eventName === "Paid" ? stub.routerPaid : stub.invoicesPaid)]
    .sort((a, b) => b.block - a.block)
    .map((e) => ({
      tNumber: e.inputs.tNumber,
      payout: e.inputs.payout.toLowerCase(),
      amount: e.inputs.amount,
      invoiceRef: asBytes(e.inputs.invoiceRef), // as MultiBaas's event queries return a bytes32
      block: String(e.block),
      at: e.at.replace("T", " ").replace(/Z$/u, "+00"), // "2026-09-26 03:10:00+00"
      txHash: e.txHash,
    }));
}

/** "0xdac8…" → "[218, 200, …]": how the real event queries render a bytes32. */
function asBytes(hex: string): string {
  return `[${(hex.slice(2).match(/../gu) ?? []).map((b) => parseInt(b, 16)).join(", ")}]`;
}

function eventsFor(stub: StubMultiBaas, params: URLSearchParams) {
  const txHash = params.get("tx_hash");
  return stub.invoicesPaid
    .filter((e) => !txHash || e.txHash === txHash)
    .map((e) => ({
      triggeredAt: e.at,
      event: {
        name: "InvoicePaid",
        signature: "InvoicePaid(uint64,address,uint256,bytes32)",
        inputs: Object.entries(e.inputs).map(([name, value]) => ({ name, value, hashed: false, type: "x" })),
        contract: { address: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B", label: "meigi_agent_vault" },
      },
      transaction: { txHash: e.txHash, blockNumber: e.block, from: "0x0" },
    }));
}
