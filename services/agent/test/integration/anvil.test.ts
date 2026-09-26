import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentVaultAbi, mockJPYCAbi } from "@meigi/abi";
import { createPublicClient, http, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import { foundry } from "viem/chains";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig as loadSignerConfig, startSigner } from "@meigi/signer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasFoundry } from "../../scripts/stack/anvil.js";
import { agentEnv, signerEnv, startLocalStack, type LocalStack } from "../../scripts/stack/stack.js";
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { invoiceRefOf } from "../../src/kernel/intent.js";
import { buildDeps } from "../../src/wiring.js";
import { demo, FakeTriage, MEIGI_PAYOUT, routineTriage, SCAMMER, yen } from "../fakes.js";
import { approvalHarness, approvedWith, denied, type Harness } from "../mock-idp.js";

/**
 * The whole path on real contracts: forge deploys Deploy.s.sol to a fresh anvil, the attester registers the
 * demo vendors, the vault owner approves Meigi Shoji, MockJPYC funds the vault. Then the HTTP API pays a
 * routine invoice for real and turns every attack into a decoded revert without broadcasting it. The agent holds
 * no key: the signer (services/signer, in-process here) holds anvil's agent key and signs over localhost.
 * System-1 triage is a separate model service, so it is canned here; everything else is the production code.
 */
describe.skipIf(!hasFoundry())("agent against the real contracts on anvil", () => {
  let stack: LocalStack;
  let app: ReturnType<typeof createApp>;
  let reader: PublicClient;
  let cacheDir: string;
  let human: Harness; // World ID for Agents, against a mock IdP
  let signer: ServerType;
  let signerUrl: string;
  const SIGNER_TOKEN = "t".repeat(64);
  const CEILING_YEN = 200_000; // above the demo invoices, so the routine one pays on its own; tested below

  beforeAll(async () => {
    stack = await startLocalStack({ port: Number(process.env.ANVIL_PORT ?? 8547) });
    if (stack.anvil.note) process.stderr.write(`[integration] ${stack.anvil.note}\n`);
    cacheDir = mkdtempSync(join(tmpdir(), "meigi-agent-it-"));
    human = await approvalHarness();
    const signerConfig = loadSignerConfig(signerEnv(stack, { port: 8799, token: SIGNER_TOKEN, humanAboveYen: CEILING_YEN }));
    const started = await startSigner(signerConfig, () => human.idp.clock.now); // the mock IdP's clock dates its proofs
    signer = await new Promise<ServerType>((resolve) => {
      const server = serve({ fetch: started.app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(server));
    });
    signerUrl = `http://127.0.0.1:${(signer.address() as AddressInfo).port}`;
    const config = loadConfig({
      ...agentEnv(stack, { url: signerUrl, token: SIGNER_TOKEN }),
      LLM_PROVIDER: "none",
      TRIAGE_BACKENDS: "systemone",
      INTERCEPTA_CACHE_PATH: join(cacheDir, "intercepta.json"),
      AUDIT_LOG_PATH: join(cacheDir, "audit.jsonl"),
    });
    const { deps, init } = buildDeps(config);
    await init();
    app = createApp({ ...deps, triage: new FakeTriage(routineTriage()), approvals: human.approvals });
    reader = createPublicClient({ chain: foundry, transport: http(stack.anvil.url) }) as PublicClient;
  });

  afterAll(() => {
    signer?.close();
    stack?.anvil.stop();
    if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  });

  async function post(path: string, body: unknown = {}): Promise<Record<string, any>> {
    const res = await app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(200);
    return (await res.json()) as Record<string, any>;
  }
  const analyze = (file: string) => post("/invoices/analyze", { text: demo(file) });
  const balanceOf = (account: Address) =>
    reader.readContract({ address: stack.deployment.token, abi: mockJPYCAbi, functionName: "balanceOf", args: [account] });
  const agentNonce = () => reader.getTransactionCount({ address: stack.accounts.agent.address });

  it("pays a routine invoice to the registered payout, on-chain", async () => {
    const analysis = await analyze("01-routine-invoice.ja.txt");
    expect(analysis.verdict).toMatchObject({ decision: "pay", reasons: [] });
    expect(analysis.kernel.payee).toMatchObject({ legalName: "株式会社メイギ商事", registeredPayout: MEIGI_PAYOUT });
    const before = await balanceOf(MEIGI_PAYOUT);

    const paid = await post(`/invoices/${analysis.id}/pay`);
    expect(paid).toMatchObject({ status: "paid", forced: false, payTo: MEIGI_PAYOUT, amount: "¥132,000" });
    const receipt = await reader.getTransactionReceipt({ hash: paid.txHash as Hex });
    expect(receipt.status).toBe("success");
    const [event] = parseEventLogs({ abi: agentVaultAbi, eventName: "InvoicePaid", logs: receipt.logs });
    expect(event?.args).toEqual({
      tNumber: 2011001234567n,
      payout: MEIGI_PAYOUT,
      amount: yen(132_000),
      invoiceRef: invoiceRefOf("2011001234567", "MS-2026-0917"),
    });
    expect((await balanceOf(MEIGI_PAYOUT)) - before).toBe(yen(132_000));
  });

  it("reads the settlement back from RPC logs when MultiBaas is off", async () => {
    const res = await app.request("/payments?tNumber=T2011001234567");
    const body = (await res.json()) as Record<string, any>;
    expect(body.source).toEqual({ settled: "rpc", received: "rpc" });
    expect(body.settled).toContainEqual(
      expect.objectContaining({
        tNumber: "T2011001234567",
        legalName: "株式会社メイギ商事",
        payout: MEIGI_PAYOUT,
        amount: { units: yen(132_000).toString(), display: "¥132,000" },
        invoiceRef: invoiceRefOf("2011001234567", "MS-2026-0917"),
      }),
    );
    expect(body.received).toEqual([expect.objectContaining({ tNumber: "T2011001234567", payout: MEIGI_PAYOUT, total: expect.objectContaining({ display: "¥132,000" }) })]);
  });

  it("refuses a swapped address with PayeeMismatch, decoded into a sentence, and broadcasts nothing", async () => {
    const analysis = await analyze("02-bank-change-bec.ja.txt");
    expect(analysis.verdict.decision).toBe("hold");
    expect(analysis.verdict.reasons).toContainEqual(
      expect.objectContaining({ code: "payout_mismatch", legalName: "株式会社メイギ商事", revert: "PayeeMismatch" }),
    );
    const nonce = await agentNonce();

    const forced = await post(`/invoices/${analysis.id}/pay`, { force: true });
    expect(forced).toMatchObject({
      status: "reverted",
      broadcast: false,
      error: {
        name: "PayeeMismatch",
        args: { tNumber: "2011001234567", expected: SCAMMER, registered: MEIGI_PAYOUT },
        sentence: "T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b.",
      },
    });
    expect(await agentNonce()).toBe(nonce);
    expect(await balanceOf(SCAMMER)).toBe(0n);
  });

  it("refuses the same swap from an x402 402-response", async () => {
    // The demo response names Sepolia and its MockJPYC; point it at this chain's token instead.
    const text = demo("06-x402-swapped-payto.json")
      .replace("0xEcA2B093682a46B14b143474d188A120bA2d0EC2", stack.deployment.token)
      .replace('"network": "sepolia"', '"network": "eip155:31337"');
    const analysis = await post("/invoices/analyze", { text });
    expect(analysis.verdict.reasons.map((r: { code: string }) => r.code)).toEqual(expect.arrayContaining(["payout_mismatch"]));
    expect(analysis.verdict.reasons.map((r: { code: string }) => r.code)).not.toContain("x402_asset_mismatch");
    const forced = await post(`/invoices/${analysis.id}/pay`, { force: true });
    expect(forced.error).toMatchObject({ name: "PayeeMismatch", args: { expected: SCAMMER } });
  });

  it("refuses to pay the same invoice twice", async () => {
    const analysis = await analyze("01-routine-invoice.ja.txt");
    expect(analysis.verdict.reasons).toContainEqual(expect.objectContaining({ code: "invoice_already_paid", revert: "InvoiceAlreadyPaid" }));
    const forced = await post(`/invoices/${analysis.id}/pay`, { force: true });
    expect(forced.error).toMatchObject({ name: "InvoiceAlreadyPaid", args: { paid: yen(132_000).toString() } });
    expect(forced.error.sentence).toBe("This invoice was already paid (¥132,000 to T2011001234567 = 株式会社メイギ商事); a second payment is refused.");
  });

  it("refuses a registered firm that is not an approved vendor (the fake-CEO request)", async () => {
    const analysis = await analyze("03-fake-ceo-urgent.en.txt");
    expect(analysis.kernel.checks).toContainEqual(expect.objectContaining({ code: "payout_matches", ok: true }));
    const forced = await post(`/invoices/${analysis.id}/pay`, { force: true });
    expect(forced.error.name).toBe("VendorNotApproved");
    expect(forced.error.sentence).toMatch(/^T3999905000001 = 合同会社ベイサイド・アドバイザリー is not on this vault's approved vendor list/u);
  });

  it("pays an urgent invoice only after a verified human approves it; force or a denial pays nothing", async () => {
    const ask = async (id: string) => {
      const res = await app.request(`/invoices/${id}/approval`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
      expect(res.status).toBe(202);
      const { attemptId } = (await res.json()) as { attemptId: string };
      await human.approvals.settled(attemptId);
      return attemptId;
    };
    const denial = await analyze("07-urgent-invoice.ja.txt");
    expect(denial.verdict.reasons.map((r: { code: string }) => r.code)).toEqual(["pressure_hold"]);
    const nonce = await agentNonce();
    const forced = await post(`/invoices/${denial.id}/pay`, { force: true }); // force never stands in for the human
    expect(forced).toMatchObject({ status: "held", reasons: [expect.objectContaining({ code: "force_needs_human" })] });
    human.idp.token = [denied];
    const deniedId = await ask(denial.id);
    const refused = await app.request(`/invoices/${denial.id}/pay`, {
      method: "POST",
      body: JSON.stringify({ approvalId: deniedId }),
      headers: { "content-type": "application/json" },
    });
    expect(refused.status).toBe(409);
    expect(await agentNonce()).toBe(nonce);

    const approval = await analyze("07-urgent-invoice.ja.txt");
    human.idp.token = [approvedWith(await human.idp.sign())];
    const approvalId = await ask(approval.id);
    const paid = await post(`/invoices/${approval.id}/pay`, { approvalId });
    expect(paid).toMatchObject({ status: "paid", forced: false, payTo: MEIGI_PAYOUT, amount: "¥55,000" });
    const receipt = await reader.getTransactionReceipt({ hash: paid.txHash as Hex });
    const [event] = parseEventLogs({ abi: agentVaultAbi, eventName: "InvoicePaid", logs: receipt.logs });
    expect(event?.args).toMatchObject({ payout: MEIGI_PAYOUT, amount: yen(55_000), invoiceRef: invoiceRefOf("2011001234567", "MS-2026-0926") });
  });

  it("the signer's own ceiling: above it, nothing is signed without a fresh human approval", async () => {
    const before = await agentNonce();
    const pay = async (body: Record<string, unknown>) => {
      const res = await fetch(`${signerUrl}/pay`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${SIGNER_TOKEN}` }, body: JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as Record<string, any> };
    };
    const over = { tNumber: "2011001234567", payout: SCAMMER, amount: yen(250_000).toString(), invoiceRef: invoiceRefOf("2011001234567", "MS-2026-9999") };
    expect(await pay(over)).toMatchObject({ status: 403, body: { code: "human_approval_required" } });
    // With a fresh Orb-level approval the ceiling lifts, and the chain has the last word: this payout is wrong.
    const idToken = await human.idp.sign({ auth_time: human.idp.clock.now });
    const approved = await pay({ ...over, approval: { idToken } });
    expect(approved).toMatchObject({ status: 200, body: { ok: false, revert: { data: expect.stringMatching(/^0x/u) } } });
    expect(await agentNonce()).toBe(before); // nothing was sent either time
    const unauthorized = await fetch(`${signerUrl}/pay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(over) });
    expect(unauthorized.status).toBe(401);
  });

  it("GET /vault reads the live vault", async () => {
    const res = await app.request("/vault");
    const vault = (await res.json()) as Record<string, any>;
    expect(vault).toMatchObject({ agentAuthorized: true, paused: false, balance: { display: "¥4,813,000" }, token: { symbol: "mJPYC" } });
    expect(vault.vendors[0]).toMatchObject({
      tNumber: "T2011001234567",
      approved: true,
      active: true,
      payoutChanged: false,
      spentInPeriod: "¥187,000",
      remainingInPeriod: "¥813,000",
    });
    expect(vault.vendors[1]).toMatchObject({ tNumber: "T3999905000001", status: "active", approved: false });
  });
});
