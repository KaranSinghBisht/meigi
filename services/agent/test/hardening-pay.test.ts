import { agentVaultAbi } from "@meigi/abi";
import { encodeErrorResult, type Address, type PublicClient } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ConfigMismatchError, createChainReader } from "../src/chain/reader.js";
import { decodeRaw } from "../src/chain/revert.js";
import { extractInvoice } from "../src/extract/extract.js";
import { buildIntent } from "../src/kernel/intent.js";
import { evaluate } from "../src/kernel/kernel.js";
import type { Proposal } from "../src/llm/types.js";
import { activePayee, AGENT, approvedVendor, demo, FakeLlm, fakeDeps, MEIGI_PAYOUT, NOW, T_MEIGI, TOKEN, VAULT, yen } from "./fakes.js";

/** Regressions for the independent review: the pay path, HTTP hygiene and start-up checks. */

let deps: ReturnType<typeof fakeDeps>;
let app: ReturnType<typeof createApp>;

function build(llm: FakeLlm | null = null, apiToken: string | null = null) {
  deps = { ...fakeDeps({}, llm), apiToken };
  app = createApp(deps);
}

beforeEach(() => build());

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { "content-type": "application/json", ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(path, init);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}
const analyze = async (text: string) => (await call("POST", "/invoices/analyze", { text })).body;

describe("force pays the printed values, never the model's guesses (H3)", () => {
  it("never sends the model's amount: the intent keeps the printed one, and force can't override the disagreement", async () => {
    const greedy: Proposal = { tNumber: "T2011001234567", payTo: MEIGI_PAYOUT, amount: "450000", invoiceNumber: "MS-2026-0917", wouldPay: true, reasoning: "" };
    build(new FakeLlm(greedy));
    const analysis = await analyze(demo("01-routine-invoice.ja.txt"));
    expect(analysis.verdict.reasons.map((r: { code: string }) => r.code)).toContain("proposal_amount_differs");
    expect(analysis.kernel.intent.amount.units).toBe(yen(132_000).toString());
    const forced = await call("POST", `/invoices/${analysis.id}/pay`, { force: true });
    expect(forced.body).toMatchObject({ status: "held", reasons: [expect.objectContaining({ code: "force_refused" })] });
    expect(deps.payer.simulated).toHaveLength(0);
  });

  it("refuses to force when the amount itself is in doubt", async () => {
    const analysis = await analyze("登録番号: T2011001234567\n請求書番号: X-1\nご請求金額 ¥100,000\n合計 ¥90,000");
    const forced = await call("POST", `/invoices/${analysis.id}/pay`, { force: true });
    expect(forced.body).toMatchObject({ status: "held", reasons: [expect.objectContaining({ code: "force_refused" })] });
    expect(deps.payer.simulated).toHaveLength(0);
  });
});

describe("sent transactions are never lost or resent (M3)", () => {
  it("reports a slow transaction as pending, then settles it without sending again", async () => {
    deps.payer.mode = "pending";
    const analysis = await analyze(demo("01-routine-invoice.ja.txt"));
    const first = await call("POST", `/invoices/${analysis.id}/pay`);
    expect(first.body).toMatchObject({ status: "pending", txHash: "0xfeed1" });
    expect((await call("POST", `/invoices/${analysis.id}/pay`)).body.status).toBe("pending");
    deps.payer.mine = "success";
    expect((await call("POST", `/invoices/${analysis.id}/pay`)).body).toMatchObject({ status: "paid", txHash: "0xfeed1" });
    expect(deps.payer.sent).toHaveLength(1);
  });

  it("reports a mined revert as broadcast, with its hash", async () => {
    deps.payer.mode = "reverted";
    const analysis = await analyze(demo("01-routine-invoice.ja.txt"));
    const { body } = await call("POST", `/invoices/${analysis.id}/pay`);
    expect(body).toMatchObject({ status: "reverted", broadcast: true, txHash: "0xfeed1", error: { name: "TransactionReverted" } });
  });

  it("reports a simulated revert as not broadcast", async () => {
    deps.payer.revert = decodeRaw(encodeErrorResult({ abi: agentVaultAbi, errorName: "VendorNotApproved", args: [T_MEIGI] }));
    const analysis = await analyze(demo("02-bank-change-bec.ja.txt"));
    const { body } = await call("POST", `/invoices/${analysis.id}/pay`, { force: true });
    expect(body).toMatchObject({ status: "reverted", broadcast: false });
    expect(body.txHash).toBeUndefined();
  });
});

describe("HTTP hygiene (M4)", () => {
  it("requires application/json on POSTs", async () => {
    const res = await app.request("/invoices/analyze", { method: "POST", body: "text=hi", headers: { "content-type": "text/plain" } });
    expect(res.status).toBe(415);
  });

  it("requires the bearer token on POSTs when one is configured", async () => {
    build(null, "0123456789abcdef-token");
    expect((await call("POST", "/invoices/analyze", { text: "x" })).status).toBe(401);
    const ok = await call("POST", "/invoices/analyze", { text: "x" }, { authorization: "Bearer 0123456789abcdef-token" });
    expect(ok.status).toBe(200);
    expect((await app.request("/health")).status).toBe(200);
  });
});

describe("kernel document checks", () => {
  function kernel(text: string, chain: { chainId: number; token: Address }) {
    const extracted = extractInvoice(text);
    const { intent, reasons } = buildIntent(extracted, null, 18);
    const snapshot = {
      blockNumber: 1n,
      timestamp: NOW,
      payee: activePayee(),
      vendor: approvedVendor(),
      invoicePaid: 0n,
      vault: { paused: false, agent: AGENT, balance: yen(10_000_000) },
    };
    const document = { claimedName: extracted.claimedName, x402: extracted.x402 };
    return evaluate(intent!, reasons, snapshot, { decimals: 18, agent: AGENT, documentAddresses: extracted.addresses, document, chain });
  }

  it("holds x402 requests for another token or network, and pays x402 in atomic units (M5)", () => {
    const x402 = demo("06-x402-swapped-payto.json");
    const sepoliaMock = "0xEcA2B093682a46B14b143474d188A120bA2d0EC2" as Address;
    const codes = (k: ReturnType<typeof kernel>) => k.reasons.map((r) => r.code);
    expect(codes(kernel(x402, { chainId: 11155111, token: sepoliaMock }))).not.toContain("x402_asset_mismatch");
    expect(codes(kernel(x402, { chainId: 11155111, token: TOKEN }))).toContain("x402_asset_mismatch");
    expect(codes(kernel(x402, { chainId: 31337, token: sepoliaMock }))).toContain("x402_network_mismatch");
    expect(kernel(x402, { chainId: 11155111, token: sepoliaMock }).intent?.amount.units).toBe("500000000000000000000");
  });

  it("warns when the printed company is not the registered one (M6)", () => {
    const text = demo("01-routine-invoice.ja.txt").replace("株式会社メイギ商事\n〒", "株式会社ニセモノ商事\n〒");
    const warning = kernel(text, { chainId: 11155111, token: TOKEN }).reasons.find((r) => r.code === "name_differs");
    expect(warning).toMatchObject({ severity: "warn", evidence: "株式会社ニセモノ商事", legalName: "株式会社メイギ商事" });
    expect(warning?.message).not.toContain("ニセモノ");
  });
});

describe("start-up refuses the owner's key or a foreign key (M7)", () => {
  function readerWith(roles: { agent: Address; owner: Address }) {
    const values: Record<string, unknown> = { registry: VAULT, token: TOKEN, decimals: 18, symbol: "mJPYC", ...roles };
    const client = { readContract: async ({ functionName }: { functionName: string }) => values[functionName] } as unknown as PublicClient;
    return createChainReader({ client, chainId: 31337, vault: VAULT, agent: AGENT, registry: VAULT });
  }

  it("rejects the owner key and a key that isn't the vault's agent", async () => {
    const other = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
    await expect(readerWith({ agent: AGENT, owner: AGENT }).init()).rejects.toBeInstanceOf(ConfigMismatchError);
    await expect(readerWith({ agent: other, owner: other }).init()).rejects.toThrow(/vault's agent is/u);
    await expect(readerWith({ agent: AGENT, owner: other }).init()).resolves.toBeUndefined();
  });
});
