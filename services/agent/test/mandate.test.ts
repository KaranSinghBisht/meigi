import { mandateGateAbi } from "@meigi/abi";
import { encodeErrorResult, zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analysis/analyze.js";
import { payAnalysis } from "../src/analysis/pay.js";
import { loadConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { describeRevert } from "../src/chain/describe.js";
import { decodeRaw } from "../src/chain/revert.js";
import { AGENT, demo, fakeDeps, FakeChain, FakePayer } from "./fakes.js";

/**
 * The buyer company's ENS mandate (MandateGate): when the vault's agent is the gate, the agent may pay only while the
 * mandate answers and names its key. Otherwise it holds, at analysis and at pay time alike, and sends nothing.
 */

const GATE = "0x6a7e000000000000000000000000000000000002" as Address;
const NAME = "ap.t4999900000005.payee.eth";
const STRANGER = "0x0000000000000000000000000000000000000bad" as Address;

function gated(holder: Address) {
  const chain = new FakeChain();
  chain.vaultState.agent = GATE;
  chain.mandate = { gate: GATE, name: NAME, holder };
  return chain;
}

const mandateNotLive = () => decodeRaw(encodeErrorResult({ abi: mandateGateAbi, errorName: "MandateNotLive", args: [4999900000005n, "ap"] }));

describe("paying through the buyer company's ENS mandate", () => {
  it("pays while the mandate answers and names this key", async () => {
    const payer = new FakePayer();
    const deps = fakeDeps({ chain: gated(AGENT), payer });
    const stored = await analyzeDocument(deps, demo("01-routine-invoice.ja.txt"));
    expect(stored.verdict.decision).toBe("pay");
    expect(stored.view.kernel.checks).toContainEqual(expect.objectContaining({ code: "mandate_live", ok: true }));
    expect(await payAnalysis(deps, stored, "auto", () => {})).toMatchObject({ status: "paid" });
  });

  it("holds, at analysis, while the mandate doesn't answer or names another key", async () => {
    for (const [holder, code, revert] of [[zeroAddress, "mandate_not_live", "MandateNotLive"], [STRANGER, "not_mandate_holder", "NotMandateHolder"]] as const) {
      const stored = await analyzeDocument(fakeDeps({ chain: gated(holder) }), demo("01-routine-invoice.ja.txt"));
      expect(stored.verdict.decision).toBe("hold");
      expect(stored.verdict.reasons).toContainEqual(expect.objectContaining({ code, revert }));
    }
    const dark = await analyzeDocument(fakeDeps({ chain: gated(zeroAddress) }), demo("01-routine-invoice.ja.txt"));
    expect(dark.verdict.reasons.find((r) => r.code === "mandate_not_live")?.message).toContain(NAME);
  });

  it("holds cleanly, sending nothing, when the mandate is revoked between the analysis and the payment", async () => {
    const chain = gated(AGENT);
    const payer = new FakePayer();
    const deps = fakeDeps({ chain, payer });
    const stored = await analyzeDocument(deps, demo("01-routine-invoice.ja.txt"));
    payer.revert = mandateNotLive(); // the company revoked the name; the gate now refuses
    const result = await payAnalysis(deps, stored, "auto", () => {});
    expect(result).toMatchObject({ status: "held", reasons: [{ code: "mandate_not_live", revert: "MandateNotLive" }] });
    expect(result.status === "held" && result.reasons[0]?.message).toContain(NAME);
    expect(payer.sent).toEqual([]);
  });

  it("still refuses a vault whose agent is neither this key nor a configured gate", async () => {
    const chain = new FakeChain();
    chain.vaultState.agent = GATE; // a gate, but not the one configured
    const stored = await analyzeDocument(fakeDeps({ chain }), demo("01-routine-invoice.ja.txt"));
    expect(stored.verdict.reasons).toContainEqual(expect.objectContaining({ code: "not_agent", revert: "NotAgent" }));
  });

  it("decodes the gate's refusals into sentences", async () => {
    const ctx = { decimals: 18, nameOf: async () => null };
    expect((await describeRevert(mandateNotLive(), ctx)).sentence).toContain(`${NAME} doesn't answer`);
    const other = decodeRaw(encodeErrorResult({ abi: mandateGateAbi, errorName: "NotMandateHolder", args: [AGENT, STRANGER] }));
    expect((await describeRevert(other, ctx)).sentence).toMatch(/names 0x0000…0Bad, not this agent's key/u);
    const disputed = decodeRaw(encodeErrorResult({ abi: mandateGateAbi, errorName: "PrincipalNotActive", args: [4999900000005n] }));
    expect((await describeRevert(disputed, ctx)).sentence).toContain("T4999900000005 is not active");
  });

  it("is off unless SIGNER_VIA_GATE=1, which needs the gate's address", () => {
    const env = { SEPOLIA_RPC_URL: "http://127.0.0.1:8547", AGENT_ADDRESS: AGENT, SIGNER_TOKEN: "s".repeat(64), REGISTRY_ADDRESS: `0x${"22".repeat(20)}`, VAULT_ADDRESS: `0x${"33".repeat(20)}` };
    expect(loadConfig(env).SIGNER_VIA_GATE).toBe("0");
    expect(() => loadConfig({ ...env, SIGNER_VIA_GATE: "1" })).toThrow("MANDATE_GATE_ADDRESS, MANDATE_PRINCIPAL");
    const on = { ...env, SIGNER_VIA_GATE: "1", MANDATE_GATE_ADDRESS: GATE, MANDATE_PRINCIPAL: "4999900000005" };
    expect(loadConfig(on)).toMatchObject({ SIGNER_VIA_GATE: "1", MANDATE_GATE_ADDRESS: GATE, MANDATE_LABEL: "ap" });
  });

  it("shows the mandate in GET /vault, and counts its holder as authorised", async () => {
    const body = async (holder: Address) => (await (await createApp(fakeDeps({ chain: gated(holder) })).request("/vault")).json()) as Record<string, any>;
    expect(await body(AGENT)).toMatchObject({ vaultAgent: GATE, agentAuthorized: true, mandate: { gate: GATE, name: NAME, holder: AGENT, live: true } });
    expect(await body(zeroAddress)).toMatchObject({ agentAuthorized: false, mandate: { live: false } });
  });
});
