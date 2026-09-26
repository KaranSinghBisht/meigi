import { payeeRegistryAbi } from "@meigi/abi";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { createMultiBaasHistory } from "../src/history/multibaas.js";
import { invoiceRefOf } from "../src/kernel/intent.js";
import { createMultiBaas, MultiBaasUnavailable } from "../src/multibaas/client.js";
import { V2_START_BLOCK } from "../src/multibaas/labels.js";
import { prepareLibrary, setupMultiBaas } from "../src/multibaas/setup.js";
import { demo, FakeHistory, fakeDeps, MEIGI_PAYOUT, SCAMMER, yen, type Fakes } from "./fakes.js";
import { startStubMultiBaas, STUB_KEY, type StubMultiBaas } from "./stub-multibaas.js";

let stub: StubMultiBaas;
beforeEach(async () => {
  stub = await startStubMultiBaas();
});
afterEach(() => stub.close());

const mbClient = () => createMultiBaas({ url: stub.url, apiKey: STUB_KEY, timeoutMs: 2_000 });
const REF = invoiceRefOf("2011001234567", "MS-2026-0917");
const DEPLOYMENT = {
  chainId: 11155111,
  registry: "0x205c977cF1f4Ed42e51a48759550eF40160A6396",
  vault: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B",
  router: "0xbA95BA5D4a2244cce46a76920f411B225116850C",
  token: "0xEcA2B093682a46B14b143474d188A120bA2d0EC2",
  startBlock: V2_START_BLOCK,
};

/** The agent's chain in MultiBaas, linked at `linkStart`; RPC logs (a FakeHistory) from the v2 block. */
function withMultiBaas(linkStart = V2_START_BLOCK): AppDeps & Fakes {
  stub.linkStart = linkStart;
  const deps = fakeDeps();
  (deps.history.rpc as FakeHistory).fromBlock = BigInt(V2_START_BLOCK);
  return { ...deps, history: { multibaas: createMultiBaasHistory(mbClient(), 11155111), rpc: deps.history.rpc, mizuhiki: null } };
}

async function call(deps: AppDeps, method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await createApp(deps).request(path, init);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe("MultiBaas client", () => {
  it("sends the key as a Bearer token and reads the result envelope", async () => {
    stub.invoicesPaid.push({ txHash: "0xaa", block: 11781200, at: "2026-09-26T03:00:00Z", inputs: { tNumber: "2011001234567", payout: MEIGI_PAYOUT, amount: yen(1000).toString(), invoiceRef: REF } });
    const events = await mbClient().events({ txHash: "0xaa" });
    expect(events).toHaveLength(1);
    expect(stub.requests[0]?.path).toBe("/api/v0/events?tx_hash=0xaa");
  });

  it("reports an outage, a wrong key and an unexpected body as MultiBaasUnavailable", async () => {
    stub.down = true;
    await expect(mbClient().events({})).rejects.toMatchObject({ name: "MultiBaasUnavailable", status: 503 });
    stub.down = false;
    await expect(createMultiBaas({ url: stub.url, apiKey: "wrong-key-0123456789" }).events({})).rejects.toMatchObject({ status: 401 });
    await expect(createMultiBaas({ url: "http://127.0.0.1:9", apiKey: STUB_KEY, timeoutMs: 500 }).events({})).rejects.toBeInstanceOf(MultiBaasUnavailable);
  });
});

describe("setup", () => {
  it("imports, aliases and links the four contracts from the deploy block, saves the queries, and is idempotent", async () => {
    stub.verified.set(DEPLOYMENT.registry, JSON.stringify(payeeRegistryAbi));
    stub.verified.set(DEPLOYMENT.token, JSON.stringify([{ type: "function", name: "upgradeTo", inputs: [] }])); // a proxy's own ABI
    const log: string[] = [];
    await setupMultiBaas(mbClient(), DEPLOYMENT, (line) => log.push(line));
    expect([...stub.contracts.keys()].sort()).toEqual(["meigi_agent_vault", "meigi_jpy_token", "meigi_pay_router", "meigi_payee_registry"]);
    expect(stub.aliases.get("meigi_vault")).toMatchObject({ address: DEPLOYMENT.vault, links: [{ label: "meigi_agent_vault", startingBlock: String(V2_START_BLOCK) }] });
    expect([...stub.queries.keys()].sort()).toEqual([
      "meigi_invoices_by_payee",
      "meigi_invoices_paid",
      "meigi_mjpy_balances",
      "meigi_mjpy_received",
      "meigi_mjpy_transfers",
      "meigi_payees_registered",
      "meigi_router_paid",
    ]);
    expect(log).toContain("PayeeRegistry: ABI imported from its verified source");
    expect(log).toContain("AgentVault: no verified source found, using the repo's ABI");
    expect(log).toContain("MockJPYC: no verified source found, using the repo's ABI"); // the proxy ABI has no Transfer

    const before = stub.requests.filter((r) => r.method === "POST").length;
    await setupMultiBaas(mbClient(), DEPLOYMENT, () => {});
    expect(stub.requests.filter((r) => r.method === "POST").length).toBe(before); // nothing created twice
  });
});

describe("the saved queries that name a deployment's addresses", () => {
  it("count only mJPYC router payments and the x402 buyer's transfers, filtered inside MultiBaas", async () => {
    await setupMultiBaas(mbClient(), DEPLOYMENT, () => {});
    const filterOf = (name: string) => (stub.queries.get(name) as { events: { filter: unknown }[] }).events[0]!.filter;
    expect(filterOf("meigi_router_paid")).toEqual({
      rule: "and",
      children: [
        { fieldType: "contract_address_alias", operator: "equal", value: "meigi_router" },
        { fieldType: "input", inputIndex: 3, operator: "equal", value: DEPLOYMENT.token.toLowerCase() },
      ],
    });
    expect(filterOf("meigi_mjpy_transfers")).toMatchObject({ children: [{ value: "meigi_mjpy" }, { inputIndex: 0, value: "0x708106dcdee19be75ffcd5df20cbb1b6b3089882" }] });
  });

  it("are left out of a library-only setup, before the token exists, and on a chain without the x402 buyer", async () => {
    stub.chainId = 31337;
    await prepareLibrary(mbClient(), 31337, () => {});
    expect(stub.queries.has("meigi_router_paid")).toBe(false);
    await setupMultiBaas(mbClient(), { ...DEPLOYMENT, chainId: 31337 }, () => {});
    expect(stub.queries.has("meigi_router_paid")).toBe(true);
    expect(stub.queries.has("meigi_mjpy_transfers")).toBe(false);
  });

  it("include the x402 buyer's transfers on Mizuhiki Awaji, where the research agent buys too", async () => {
    stub.chainId = 6497;
    await setupMultiBaas(mbClient(), { ...DEPLOYMENT, chainId: 6497 }, () => {});
    expect(JSON.stringify(stub.queries.get("meigi_mjpy_transfers"))).toContain("0x708106dcdee19be75ffcd5df20cbb1b6b3089882");
  });
});

describe("a deployment on the wrong chain", () => {
  it("is never used: /payments falls back to RPC and says why", async () => {
    stub.chainId = 6497; // e.g. a deployment created on MIZUHIKI Awaji
    stub.invoicesPaid.push({ txHash: "0xdd", block: 1, at: "2026-09-26T03:00:00Z", inputs: { tNumber: "2011001234567", payout: MEIGI_PAYOUT, amount: "1", invoiceRef: REF } });
    const { body } = await call(withMultiBaas(), "GET", "/payments");
    expect(body.source).toEqual({ settled: "rpc", received: "rpc" });
    expect(body.notes).toEqual(["MultiBaas unavailable (the MultiBaas deployment is on chain 6497, not 11155111); read from RPC logs"]);
    expect(body.settled).toEqual([]);
  });

  it("is never written to by the setup script", async () => {
    stub.chainId = 6497;
    await expect(setupMultiBaas(mbClient(), DEPLOYMENT, () => {})).rejects.toThrow("the MultiBaas deployment is on chain 6497, not 11155111");
    expect(stub.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });
});

describe("a plan that caps past-log depth", () => {
  it("links from 100 blocks back when the v2 block is refused, and says so", async () => {
    stub.shallowPlan = true;
    const log: string[] = [];
    await setupMultiBaas(mbClient(), DEPLOYMENT, (line) => log.push(line));
    expect(stub.aliases.get("meigi_vault")?.links).toEqual([expect.objectContaining({ startingBlock: "-100" })]);
    expect(log).toContain(`linked meigi_vault to meigi_agent_vault, indexing from 100 blocks back (the plan refused block ${V2_START_BLOCK})`);
  });

  it("links from a relative start when asked, without trying an absolute block first", async () => {
    stub.shallowPlan = true;
    const log: string[] = [];
    await setupMultiBaas(mbClient(), { ...DEPLOYMENT, startBlock: -100 }, (line) => log.push(line));
    expect(stub.requests.filter((r) => r.path.endsWith("/contracts") && r.method === "POST")).toHaveLength(4); // one link each, no retries
    expect(log).toContain("linked meigi_vault to meigi_agent_vault, indexing from 100 blocks back");
  });
});

describe("GET /payments", () => {
  it("reads settled payments and receipts from MultiBaas's index, and refusals from the agent", async () => {
    stub.invoicesPaid.push({ txHash: "0xbb", block: 11781300, at: "2026-09-26T03:10:00Z", inputs: { tNumber: "2011001234567", payout: MEIGI_PAYOUT, amount: yen(55_000).toString(), invoiceRef: REF } });
    stub.received.push({ payout: MEIGI_PAYOUT, total: yen(56_000).toString() });
    const deps = withMultiBaas();
    await call(deps, "POST", "/invoices/analyze", { text: demo("02-bank-change-bec.ja.txt") }); // held: a refusal
    const { status, body } = await call(deps, "GET", "/payments");
    expect(status).toBe(200);
    expect(body.source).toEqual({ settled: "multibaas", received: "multibaas" }); // indexed from the v2 block: nothing older
    expect(body.multibaasFrom).toBe(String(V2_START_BLOCK));
    expect(body.settled).toEqual([
      {
        txHash: "0xbb",
        blockNumber: "11781300",
        at: "2026-09-26T03:10:00.000Z",
        tNumber: "T2011001234567",
        legalName: "株式会社メイギ商事",
        payout: MEIGI_PAYOUT,
        amount: { units: yen(55_000).toString(), display: "¥55,000" },
        invoiceRef: REF,
        source: "multibaas",
      },
    ]);
    expect(body.received).toEqual([
      { tNumber: "T2011001234567", legalName: "株式会社メイギ商事", payout: MEIGI_PAYOUT, total: { units: yen(56_000).toString(), display: "¥56,000" }, source: "multibaas" },
    ]);
    expect(body.refused).toEqual([expect.objectContaining({ tNumber: "T2011001234567", reasons: expect.arrayContaining(["payout_mismatch"]) })]);
    expect(JSON.stringify(body)).not.toContain(SCAMMER); // a refusal never lists the address it refused to pay
  });

  it("falls back to RPC logs, and says so, when MultiBaas is down", async () => {
    stub.down = true;
    const deps = withMultiBaas();
    (deps.history.rpc as FakeHistory).payments.push({ txHash: "0xcc", blockNumber: 101n, at: null, tNumber: 2011001234567n, payout: MEIGI_PAYOUT, amount: yen(1000), invoiceRef: REF });
    const { body } = await call(deps, "GET", "/payments?tNumber=T2011001234567");
    expect(body.source).toEqual({ settled: "rpc", received: "rpc" });
    expect(body.notes[0]).toMatch(/^MultiBaas unavailable \(MultiBaas answered 503\); read from RPC logs$/u);
    expect(body.settled).toEqual([expect.objectContaining({ txHash: "0xcc", amount: { units: yen(1000).toString(), display: "¥1,000" } })]);
  });

  it("merges MultiBaas's rows from its link block with RPC logs for the older history", async () => {
    const deps = withMultiBaas(11783796); // a free plan links about 100 blocks back
    const rpc = deps.history.rpc as FakeHistory;
    const paidAt = (txHash: `0x${string}`, block: bigint, amount: number) => ({ txHash, blockNumber: block, at: null, tNumber: 2011001234567n, payout: MEIGI_PAYOUT, amount: yen(amount), invoiceRef: REF });
    rpc.payments.push(paidAt("0x55", 11781300n, 55_000), paidAt("0x10", 11781500n, 1_000), paidAt("0x20", 11783900n, 2_000)); // RPC sees every block
    rpc.totals.push({ payout: MEIGI_PAYOUT, total: yen(56_000), block: 11781500n }, { payout: MEIGI_PAYOUT, total: yen(2_000), block: 11783900n });
    stub.invoicesPaid.push({ txHash: "0x20", block: 11783900, at: "2026-09-26T04:40:00Z", inputs: { tNumber: "2011001234567", payout: MEIGI_PAYOUT, amount: yen(2_000).toString(), invoiceRef: REF } });
    stub.received.push({ payout: MEIGI_PAYOUT, total: yen(2_000).toString() });
    const { body } = await call(deps, "GET", "/payments");
    expect(body).toMatchObject({ label: "Anvil · via MultiBaas + RPC", source: { settled: "multibaas+rpc", received: "multibaas+rpc" }, multibaasFrom: "11783796", notes: [] });
    expect(body.settled.map((p: { txHash: string; source: string }) => [p.txHash, p.source])).toEqual([["0x20", "multibaas"], ["0x10", "rpc"], ["0x55", "rpc"]]);
    expect(body.received[0]).toMatchObject({ total: { units: yen(58_000).toString(), display: "¥58,000" }, source: "multibaas+rpc" }); // no block counted twice
  });

  it("reads RPC logs alone, and says why, while nothing is linked", async () => {
    const deps = withMultiBaas();
    stub.linkStart = null;
    const { body } = await call(deps, "GET", "/payments");
    expect(body.source).toEqual({ settled: "rpc", received: "rpc" });
    expect(body.notes).toEqual(["MultiBaas unavailable (meigi_vault isn't linked in MultiBaas); read from RPC logs", "MultiBaas unavailable (meigi_mjpy isn't linked in MultiBaas); read from RPC logs"]);
  });

  it("uses RPC logs without MultiBaas, and rejects a malformed T-number", async () => {
    const deps = fakeDeps();
    expect((await call(deps, "GET", "/payments")).body.source).toEqual({ settled: "rpc", received: "rpc" });
    expect((await call(deps, "GET", "/payments?tNumber=12345")).status).toBe(400);
    expect((await call(deps, "GET", "/health")).body.multibaas).toBe(false);
  });
});

describe("settlement confirmation", () => {
  it("confirms a payment once MultiBaas has indexed its InvoicePaid", async () => {
    const deps = withMultiBaas(11781350);
    const analysis = (await call(deps, "POST", "/invoices/analyze", { text: demo("01-routine-invoice.ja.txt") })).body;
    const paid = (await call(deps, "POST", `/invoices/${analysis.id}/pay`, {})).body;
    expect((await call(deps, "GET", `/invoices/${analysis.id}/settlement`)).body).toMatchObject({ status: "pending", source: "rpc", txHash: paid.txHash }); // not mined yet
    const mined = { txHash: paid.txHash, blockNumber: 11781400n, at: null, tNumber: 2011001234567n, payout: MEIGI_PAYOUT, amount: yen(132_000), invoiceRef: REF };
    (deps.history.rpc as FakeHistory).payments.push(mined);
    expect((await call(deps, "GET", `/invoices/${analysis.id}/settlement`)).body).toMatchObject({ status: "indexing", source: "multibaas", txHash: paid.txHash });
    stub.invoicesPaid.push({ txHash: paid.txHash, block: 11781400, at: "2026-09-26T03:20:00Z", inputs: { tNumber: "2011001234567", payout: MEIGI_PAYOUT, amount: yen(132_000).toString(), invoiceRef: REF } });
    expect((await call(deps, "GET", `/invoices/${analysis.id}/settlement`)).body).toEqual({
      status: "confirmed",
      source: "multibaas",
      txHash: paid.txHash,
      blockNumber: "11781400",
      at: "2026-09-26T03:20:00.000Z",
    });
  });

  it("confirms a payment older than MultiBaas's index from its receipt", async () => {
    const deps = withMultiBaas(11783796);
    const analysis = (await call(deps, "POST", "/invoices/analyze", { text: demo("01-routine-invoice.ja.txt") })).body;
    const paid = (await call(deps, "POST", `/invoices/${analysis.id}/pay`, {})).body;
    const mined = { txHash: paid.txHash, blockNumber: 11781400n, at: null, tNumber: 2011001234567n, payout: MEIGI_PAYOUT, amount: yen(132_000), invoiceRef: REF };
    (deps.history.rpc as FakeHistory).payments.push(mined);
    expect((await call(deps, "GET", `/invoices/${analysis.id}/settlement`)).body).toEqual({ status: "confirmed", source: "rpc", txHash: paid.txHash, blockNumber: "11781400", at: null });
  });

  it("says 404 for an invoice that was never paid", async () => {
    const deps = withMultiBaas();
    const analysis = (await call(deps, "POST", "/invoices/analyze", { text: demo("02-bank-change-bec.ja.txt") })).body;
    expect((await call(deps, "GET", `/invoices/${analysis.id}/settlement`)).body.code).toBe("not_paid");
  });
});
