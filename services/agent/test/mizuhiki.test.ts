import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { createIndexedNetwork } from "../src/history/network.js";
import { invoiceRefOf } from "../src/kernel/intent.js";
import { createMultiBaas } from "../src/multibaas/client.js";
import { fakeDeps, MEIGI_PAYOUT, yen } from "./fakes.js";
import { startStubMultiBaas, STUB_KEY, type StubMultiBaas } from "./stub-multibaas.js";

let stub: StubMultiBaas;
beforeEach(async () => {
  stub = await startStubMultiBaas();
});
afterEach(() => stub.close());

const mbClient = () => createMultiBaas({ url: stub.url, apiKey: STUB_KEY, timeoutMs: 2_000 });
const MEIGI = "2011001234567";
const REF = invoiceRefOf(MEIGI, "MS-2026-0926");
const FUJI_PAYOUT = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

async function payments(deps: AppDeps, query = "") {
  const res = await createApp(deps).request(`/payments${query}`);
  return (await res.json()) as Record<string, any>;
}

function withMizuhiki(): AppDeps {
  const deps = fakeDeps();
  return { ...deps, history: { ...deps.history, mizuhiki: createIndexedNetwork(mbClient()) } };
}

function seedAwaji() {
  stub.chainId = 6497;
  stub.token = { symbol: "mJPYC", decimals: 18 };
  stub.payees.push(
    { tNumber: MEIGI, payout: MEIGI_PAYOUT, legalName: "株式会社メイギ商事", block: 2386700, at: "2026-09-26T04:30:00Z", txHash: "0xa1" },
    { tNumber: "7999900000001", payout: FUJI_PAYOUT, legalName: "フジデータ株式会社", block: 2386701, at: "2026-09-26T04:30:06Z", txHash: "0xa2" },
  );
  stub.invoicesPaid.push({ txHash: "0xb1", block: 2386710, at: "2026-09-26T04:31:00Z", inputs: { tNumber: MEIGI, payout: MEIGI_PAYOUT, amount: yen(55_000).toString(), invoiceRef: REF } });
  stub.routerPaid.push({ txHash: "0xb2", block: 2386720, at: "2026-09-26T04:32:00Z", inputs: { tNumber: MEIGI, payout: MEIGI_PAYOUT, amount: yen(1_000).toString(), invoiceRef: REF } });
  stub.received.push({ payout: MEIGI_PAYOUT, total: yen(56_000).toString() });
}

describe("GET /payments on Mizuhiki Awaji", () => {
  it("adds Meigi on Mizuhiki, read through its MultiBaas deployment, beside the agent's own chain", async () => {
    seedAwaji();
    const body = await payments(withMizuhiki());
    expect(body.source).toEqual({ settled: "rpc", received: "rpc" }); // the agent's chain is unchanged
    expect(body.mizuhiki).toEqual({
      chainId: 6497,
      network: "Mizuhiki Awaji",
      label: "Mizuhiki · via MultiBaas",
      explorer: "https://awaji.blockscout.com",
      source: "multibaas",
      token: { symbol: "mJPYC", decimals: 18 },
      settled: [
        expect.objectContaining({ txHash: "0xb2", via: "router", tNumber: `T${MEIGI}`, legalName: "株式会社メイギ商事", amount: { units: yen(1_000).toString(), display: "¥1,000" } }),
        expect.objectContaining({ txHash: "0xb1", via: "vault", blockNumber: "2386710", amount: { units: yen(55_000).toString(), display: "¥55,000" } }),
      ],
      received: [
        { tNumber: "T7999900000001", legalName: "フジデータ株式会社", payout: FUJI_PAYOUT, total: { units: "0", display: "¥0" } },
        { tNumber: `T${MEIGI}`, legalName: "株式会社メイギ商事", payout: MEIGI_PAYOUT, total: { units: yen(56_000).toString(), display: "¥56,000" } },
      ],
      payees: [
        { tNumber: "T7999900000001", legalName: "フジデータ株式会社", payout: FUJI_PAYOUT, at: "2026-09-26T04:30:06Z", txHash: "0xa2" },
        { tNumber: `T${MEIGI}`, legalName: "株式会社メイギ商事", payout: MEIGI_PAYOUT, at: "2026-09-26T04:30:00Z", txHash: "0xa1" },
      ],
    });
  });

  it("formats amounts with the token's own decimals and applies the T-number filter", async () => {
    seedAwaji();
    stub.token = { symbol: "MJPY", decimals: 6 };
    stub.routerPaid[0]!.inputs.amount = "1000000000"; // ¥1,000 at 6 decimals
    const { mizuhiki } = await payments(withMizuhiki(), `?tNumber=T${MEIGI}`);
    expect(mizuhiki.token).toEqual({ symbol: "MJPY", decimals: 6 });
    expect(mizuhiki.settled[0].amount).toEqual({ units: "1000000000", display: "¥1,000" });
    expect(mizuhiki.payees.map((p: { tNumber: string }) => p.tNumber)).toEqual([`T${MEIGI}`]);
  });

  it("never shows another chain's events under the Mizuhiki label", async () => {
    seedAwaji();
    stub.chainId = 11155111;
    const { mizuhiki } = await payments(withMizuhiki());
    expect(mizuhiki).toMatchObject({ note: "MultiBaas unavailable (the MultiBaas deployment is on chain 11155111, not 6497)", settled: [], payees: [] });
    expect(stub.requests.some((r) => r.path.startsWith("/api/v0/queries"))).toBe(false);
  });

  it("says so plainly before the contracts are linked", async () => {
    stub.chainId = 6497;
    stub.tokenAliased = false;
    const { mizuhiki } = await payments(withMizuhiki());
    expect(mizuhiki).toMatchObject({ note: "MultiBaas unavailable (meigi_mjpy isn't linked in MultiBaas)", token: null, settled: [] });
  });

  it("is null when no Mizuhiki deployment is configured", async () => {
    expect((await payments(fakeDeps())).mizuhiki).toBeNull();
  });
});
