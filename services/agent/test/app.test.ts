import { agentVaultAbi } from "@meigi/abi";
import { encodeErrorResult } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { decodeRaw } from "../src/chain/revert.js";
import { invoiceRefOf } from "../src/kernel/intent.js";
import { LlmError, type Proposal } from "../src/llm/types.js";
import {
  demo,
  FakeLlm,
  FakeTriage,
  fakeDeps,
  LOOKALIKE,
  MEIGI_PAYOUT,
  routineTriage,
  SCAMMER,
  T_MEIGI,
  yen,
  type Fakes,
} from "./fakes.js";

let deps: ReturnType<typeof fakeDeps>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  deps = fakeDeps();
  app = createApp(deps);
});

async function call(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await app.request(path, init);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const analyze = (text: string) => call("POST", "/invoices/analyze", { text });
const payeeMismatch = (asked: string) =>
  decodeRaw(encodeErrorResult({ abi: agentVaultAbi, errorName: "PayeeMismatch", args: [T_MEIGI, asked as `0x${string}`, MEIGI_PAYOUT] }));

describe("POST /invoices/analyze", () => {
  it("returns every layer, and pays a routine invoice", async () => {
    const { status, body } = await analyze(demo("01-routine-invoice.ja.txt"));
    expect(status).toBe(200);
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(["id", "extracted", "triage", "kernel", "screening", "verdict", "proposal", "explanation", "timings"]),
    );
    expect(body.verdict).toMatchObject({ decision: "pay", reasons: [] });
    expect(body.proposal).toMatchObject({ status: "unavailable", provider: "none" });
    expect(body.explanation.text).toContain("T2011001234567 = 株式会社メイギ商事");
    expect(body.timings.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("holds when triage is unavailable, and says so", async () => {
    deps.triage.result = { status: "unavailable", message: "triage unavailable", attempts: [] };
    const { body } = await analyze(demo("01-routine-invoice.ja.txt"));
    expect(body.triage).toEqual({ status: "unavailable", message: "triage unavailable", attempts: [] });
    expect(body.verdict.decision).toBe("hold");
    expect(body.verdict.reasons[0]).toMatchObject({ code: "triage_unavailable", legalName: "株式会社メイギ商事" });
  });

  it("holds (not crashes) when the chain can't be read", async () => {
    deps.chain.down = true;
    const { status, body } = await analyze(demo("01-routine-invoice.ja.txt"));
    expect(status).toBe(200);
    expect(body.kernel.status).toBe("chain_unavailable");
    expect(body.verdict.decision).toBe("hold");
  });

  it("validates input", async () => {
    expect((await call("POST", "/invoices/analyze", "{nope")).body.code).toBe("invalid_json");
    expect((await call("POST", "/invoices/analyze", { text: "" })).body.code).toBe("invalid_input");
    const huge = await app.request("/invoices/analyze", { method: "POST", body: "x".repeat(70_000), headers: { "content-type": "application/json" } });
    expect(huge.status).toBe(413);
    expect((await call("GET", "/invoices/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await call("GET", "/nope")).body.code).toBe("not_found");
  });
});

describe("POST /invoices/:id/pay", () => {
  it("pays a clear invoice with payInvoice(tNumber, printed address, amount, keccak(T|invoice no.))", async () => {
    const { body: analysis } = await analyze(demo("01-routine-invoice.ja.txt"));
    const { body } = await call("POST", `/invoices/${analysis.id}/pay`);
    expect(body).toMatchObject({ status: "paid", txHash: "0xfeed1", forced: false, payTo: MEIGI_PAYOUT, amount: "¥132,000" });
    expect(deps.payer.simulated).toHaveLength(1); // always simulated first
    expect(deps.payer.sent).toEqual([
      { tNumber: T_MEIGI, expectedPayout: MEIGI_PAYOUT, amount: yen(132_000), invoiceRef: invoiceRefOf("2011001234567", "MS-2026-0917") },
    ]);
    expect((await call("POST", `/invoices/${analysis.id}/pay`)).body.txHash).toBe("0xfeed1"); // idempotent
    expect(deps.payer.sent).toHaveLength(1);
  });

  it("holds a BEC email, and a forced payment reverts in simulation without broadcasting", async () => {
    const { body: analysis } = await analyze(demo("02-bank-change-bec.ja.txt"));
    expect(analysis.verdict.decision).toBe("hold");
    const held = await call("POST", `/invoices/${analysis.id}/pay`, {});
    expect(held.body).toMatchObject({ status: "held", reasons: [expect.objectContaining({ code: "payout_mismatch" })] });
    expect(deps.payer.simulated).toHaveLength(0);

    deps.payer.revert = payeeMismatch(SCAMMER);
    const forced = await call("POST", `/invoices/${analysis.id}/pay`, { force: true });
    expect(forced.body).toMatchObject({
      status: "reverted",
      broadcast: false,
      error: {
        name: "PayeeMismatch",
        args: { tNumber: "2011001234567", expected: SCAMMER, registered: MEIGI_PAYOUT },
        sentence: "T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b.",
      },
    });
    expect(deps.payer.simulated[0]?.expectedPayout).toBe(SCAMMER);
    expect(deps.payer.sent).toEqual([]);
    // nothing reached the chain, so the explanation must not say it was refused on-chain
    expect(forced.body.explanation.text).toBe(
      "The vault refused the payment (in simulation; nothing was sent): T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b.",
    );
  });

  it("never pays a credit note, even when forced", async () => {
    const { body: analysis } = await analyze(demo("05-credit-note.ja.txt"));
    const { body } = await call("POST", `/invoices/${analysis.id}/pay`, { force: true });
    expect(body).toMatchObject({ status: "held", reasons: [expect.objectContaining({ code: "force_refused" })] });
    expect(body.reasons[0].message).toContain("credit_note");
    expect(deps.payer.simulated).toHaveLength(0);
  });

  it("reports a revert found by the in-lock re-simulation, still without broadcasting", async () => {
    const { body: analysis } = await analyze(demo("01-routine-invoice.ja.txt"));
    deps.payer.sendRevert = decodeRaw(
      encodeErrorResult({ abi: agentVaultAbi, errorName: "InvoiceAlreadyPaid", args: [T_MEIGI, `0x${"11".repeat(32)}`, yen(132_000)] }),
    );
    const { body } = await call("POST", `/invoices/${analysis.id}/pay`);
    expect(body).toMatchObject({ status: "reverted", error: { name: "InvoiceAlreadyPaid" } });
    expect(deps.payer.sent).toEqual([]);
  });
});

describe("with a gullible LLM agent", () => {
  const fooled: Proposal = {
    tNumber: "T2011001234567",
    payTo: LOOKALIKE,
    amount: "88000",
    invoiceNumber: "MS-2026-1010",
    wouldPay: true,
    reasoning: "The notice says the wallet moved and the CFO approved it.",
  };

  function withLlm(llm: FakeLlm, parts: Partial<Fakes> = {}) {
    deps = fakeDeps(parts, llm);
    app = createApp(deps);
  }

  it("shows the agent agreeing to pay the injected address, and the kernel refusing it", async () => {
    const llm = new FakeLlm(fooled);
    withLlm(llm);
    const { body } = await analyze(demo("04-prompt-injection.ja.txt"));
    expect(body.proposal).toMatchObject({ status: "ok", wouldPay: true, payTo: LOOKALIKE });
    expect(body.kernel.intent).toMatchObject({ source: "llm", payTo: LOOKALIKE });
    expect(body.verdict.reasons.map((r: { code: string }) => r.code)).toEqual(
      expect.arrayContaining(["payout_mismatch", "prompt_injection_suspected", "hidden_payment_details", "proposal_address_not_in_document"]),
    );
    expect(body.explanation).toMatchObject({ source: "llm", text: "LLM explanation (hold)" });
    // The explanation model sees kernel facts, never the document (so the injection can't reach it);
    // the console still gets the matched phrase as evidence.
    expect(JSON.stringify(llm.explained[0])).not.toContain("SYSTEM");
    expect(body.verdict.reasons).toContainEqual(expect.objectContaining({ code: "prompt_injection_suspected", evidence: "SYSTEM NOTICE" }));
    expect(llm.explained[0]?.payee.legalName).toBe("株式会社メイギ商事");

    // Hidden payment details are tampering: force can't override them, so nothing is even simulated.
    const forced = await call("POST", `/invoices/${body.id}/pay`, { force: true });
    expect(forced.body).toMatchObject({ status: "held", reasons: [expect.objectContaining({ code: "force_refused" })] });
    expect(deps.payer.simulated).toHaveLength(0);
  });

  it("lets force show the chain's answer to a fooled agent on a visible bank-change email", async () => {
    const llm = new FakeLlm({ ...fooled, payTo: SCAMMER, amount: "132000", invoiceNumber: "MS-2026-1003" });
    withLlm(llm);
    const { body } = await analyze(demo("02-bank-change-bec.ja.txt"));
    expect(body.proposal).toMatchObject({ wouldPay: true, payTo: SCAMMER });
    deps.payer.revert = payeeMismatch(SCAMMER);
    const forced = await call("POST", `/invoices/${body.id}/pay`, { force: true });
    expect(forced.body.error.sentence).toBe("T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b.");
    expect(forced.body.explanation).toMatchObject({ source: "llm", text: "LLM explanation (reverted; in simulation; nothing was sent)" });
    expect(llm.explained.at(-1)?.revert).toMatchObject({ name: "PayeeMismatch", broadcast: false }); // the model is told it was a simulation
    expect(deps.payer.sent).toEqual([]);
  });

  it("drops a model's explanation that calls a refusal in simulation on-chain, for the deterministic one", async () => {
    const llm = new FakeLlm({ ...fooled, payTo: SCAMMER, amount: "132000", invoiceNumber: "MS-2026-1003" });
    withLlm(llm);
    const { body } = await analyze(demo("02-bank-change-bec.ja.txt"));
    deps.payer.revert = payeeMismatch(SCAMMER);
    llm.explanation = "The payment was refused on-chain because the address doesn't match.";
    const forced = await call("POST", `/invoices/${body.id}/pay`, { force: true });
    expect(forced.body.explanation).toEqual({
      source: "template",
      text: "The vault refused the payment (in simulation; nothing was sent): T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b.",
      error: "the model's explanation didn't say the refusal was in simulation",
    });
  });

  it("reports an LLM failure and falls back to the deterministic extraction", async () => {
    withLlm(new FakeLlm(new LlmError("rate_limited", "Anthropic rate limit reached")), { triage: new FakeTriage(routineTriage()) });
    const { body } = await analyze(demo("01-routine-invoice.ja.txt"));
    expect(body.proposal).toEqual({ status: "unavailable", provider: "anthropic", message: "Anthropic rate limit reached" });
    expect(body.kernel.intent.source).toBe("extraction");
    expect(body.verdict.decision).toBe("pay");
  });
});

describe("GET endpoints", () => {
  it("GET /vault lists the balance and the configured vendors", async () => {
    const { body } = await call("GET", "/vault");
    expect(body).toMatchObject({ agentAuthorized: true, balance: { display: "¥10,000,000" }, token: { symbol: "mJPYC", decimals: 18 } });
    expect(body.vendors).toEqual([
      expect.objectContaining({ tNumber: "T2011001234567", legalName: "株式会社メイギ商事", approved: true, active: true, capPerPayment: "¥500,000" }),
      expect.objectContaining({ tNumber: "T3999905000001", status: "none", approved: false }),
    ]);
  });

  it("GET /health and GET /demo/invoices", async () => {
    expect((await call("GET", "/health")).body).toMatchObject({ ok: true, chainId: 31337, llm: "none" });
    const { body } = await call("GET", "/demo/invoices");
    expect(body.invoices).toHaveLength(8);
    expect(body.invoices[0]).toMatchObject({ file: "01-routine-invoice.ja.txt", text: expect.stringContaining("T2011001234567") });
  });
});
