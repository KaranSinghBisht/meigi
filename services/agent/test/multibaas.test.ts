import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { createMultiBaasHistory } from "../src/history/multibaas.js";
import { invoiceRefOf } from "../src/kernel/intent.js";
import { createMultiBaas, MultiBaasUnavailable } from "../src/multibaas/client.js";
import { V2_START_BLOCK } from "../src/multibaas/labels.js";
import { setupMultiBaas } from "../src/multibaas/setup.js";
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
  token: "0xEcA2B093682a46B14b143474d188A120bA2d0EC2",
};

function withMultiBaas(): AppDeps & Fakes {
  const deps = fakeDeps();
  return { ...deps, history: { multibaas: createMultiBaasHistory(mbClient(), 11155111), rpc: deps.history.rpc } };
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
  it("imports, aliases and links the three contracts from the v2 block, saves the queries, and is idempotent", async () => {
    stub.verified.add(DEPLOYMENT.registry);
    const log: string[] = [];
    await setupMultiBaas(mbClient(), DEPLOYMENT, (line) => log.push(line));
    expect([...stub.contracts.keys()].sort()).toEqual(["meigi_agent_vault", "meigi_mock_jpyc", "meigi_payee_registry"]);
    expect(stub.aliases.get("meigi_vault")).toMatchObject({ address: DEPLOYMENT.vault, links: [{ label: "meigi_agent_vault", startingBlock: String(V2_START_BLOCK) }] });
    expect([...stub.queries.keys()].sort()).toEqual(["meigi_invoices_by_payee", "meigi_invoices_paid", "meigi_mjpyc_received"]);
    expect(log).toContain("PayeeRegistry: ABI imported from its verified source");
    expect(log).toContain("AgentVault: no verified source found, using the repo's ABI");

    const before = stub.requests.filter((r) => r.method === "POST").length;
    await setupMultiBaas(mbClient(), DEPLOYMENT, () => {});
    expect(stub.requests.filter((r) => r.method === "POST").length).toBe(before); // nothing created twice
  });
});

describe("a deployment on the wrong chain", () => {
  it("is never used: /payments falls back to RPC and says why", async () => {
    stub.chainId = 6497; // e.g. a deployment created on MIZUHIKI Awaji
    stub.invoicesPaid.push({ txHash: "0xdd", block: 1, at: "2026-09-26T03:00:00Z", inputs: { tNumber: "2011001234567", payout: MEIGI_PAYOUT, amount: "1", invoiceRef: REF } });
    const { body } = await call(withMultiBaas(), "GET", "/payments");
    expect(body.source).toEqual({ settled: "rpc", received: "rpc" });
    expect(body.notes[0]).toBe("MultiBaas unavailable (the MultiBaas deployment is on chain 6497, not 11155111); read from RPC logs");
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
});

describe("GET /payments", () => {
  it("reads settled payments and receipts from MultiBaas's index, and refusals from the agent", async () => {
    stub.invoicesPaid.push({ txHash: "0xbb", block: 11781300, at: "2026-09-26T03:10:00Z", inputs: { tNumber: "2011001234567", payout: MEIGI_PAYOUT, amount: yen(55_000).toString(), invoiceRef: REF } });
    stub.received.push({ payout: MEIGI_PAYOUT, total: yen(56_000).toString() });
    const deps = withMultiBaas();
    await call(deps, "POST", "/invoices/analyze", { text: demo("02-bank-change-bec.ja.txt") }); // held: a refusal
    const { status, body } = await call(deps, "GET", "/payments");
    expect(status).toBe(200);
    expect(body.source).toEqual({ settled: "multibaas", received: "multibaas" });
    expect(body.settled).toEqual([
      {
        txHash: "0xbb",
        blockNumber: "11781300",
        at: "2026-09-26T03:10:00Z",
        tNumber: "T2011001234567",
        legalName: "株式会社メイギ商事",
        payout: MEIGI_PAYOUT,
        amount: { units: yen(55_000).toString(), display: "¥55,000" },
        invoiceRef: REF,
      },
    ]);
    expect(body.received).toEqual([{ tNumber: "T2011001234567", legalName: "株式会社メイギ商事", payout: MEIGI_PAYOUT, total: { units: yen(56_000).toString(), display: "¥56,000" } }]);
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

  it("uses RPC logs without MultiBaas, and rejects a malformed T-number", async () => {
    const deps = fakeDeps();
    expect((await call(deps, "GET", "/payments")).body.source).toEqual({ settled: "rpc", received: "rpc" });
    expect((await call(deps, "GET", "/payments?tNumber=12345")).status).toBe(400);
    expect((await call(deps, "GET", "/health")).body.multibaas).toBe(false);
  });
});

describe("settlement confirmation", () => {
  it("confirms a payment once MultiBaas has indexed its InvoicePaid", async () => {
    const deps = withMultiBaas();
    const analysis = (await call(deps, "POST", "/invoices/analyze", { text: demo("01-routine-invoice.ja.txt") })).body;
    const paid = (await call(deps, "POST", `/invoices/${analysis.id}/pay`, {})).body;
    expect((await call(deps, "GET", `/invoices/${analysis.id}/settlement`)).body).toMatchObject({ status: "indexing", source: "multibaas", txHash: paid.txHash });
    stub.invoicesPaid.push({ txHash: paid.txHash, block: 11781400, at: "2026-09-26T03:20:00Z", inputs: { tNumber: "2011001234567", payout: MEIGI_PAYOUT, amount: yen(132_000).toString(), invoiceRef: REF } });
    expect((await call(deps, "GET", `/invoices/${analysis.id}/settlement`)).body).toEqual({
      status: "confirmed",
      source: "multibaas",
      txHash: paid.txHash,
      blockNumber: "11781400",
      at: "2026-09-26T03:20:00Z",
    });
  });

  it("says 404 for an invoice that was never paid", async () => {
    const deps = withMultiBaas();
    const analysis = (await call(deps, "POST", "/invoices/analyze", { text: demo("02-bank-change-bec.ja.txt") })).body;
    expect((await call(deps, "GET", `/invoices/${analysis.id}/settlement`)).body.code).toBe("not_paid");
  });
});
