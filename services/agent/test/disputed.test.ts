import { agentVaultAbi } from "@meigi/abi";
import { encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { decodeRaw } from "../src/chain/revert.js";
import { activePayee, demo, FakeLlm, fakeDeps, MEIGI_PAYOUT, T_MEIGI } from "./fakes.js";

/** A disputed payee is shown as its T-number and "disputed": never a claimant's name, never its frozen payout. */

const CLAIMANT = "株式会社クレイマント商事"; // the registry's name for the disputed T-number; the invoice never prints it

async function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  const res = await app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  return (await res.json()) as Record<string, any>;
}

describe("a disputed payee", () => {
  it("is never named: not in the analysis, the explanation input, a revert or /vault", async () => {
    const llm = new FakeLlm({ tNumber: "T2011001234567", payTo: MEIGI_PAYOUT, amount: "132000", invoiceNumber: "MS-2026-0917", wouldPay: true, reasoning: "" });
    const deps = fakeDeps({}, llm);
    deps.chain.payees.set(T_MEIGI, activePayee(T_MEIGI, { status: "disputed", legalName: CLAIMANT }));
    deps.payer.revert = decodeRaw(encodeErrorResult({ abi: agentVaultAbi, errorName: "PayeeNotActive", args: [T_MEIGI] }));
    const app = createApp(deps);

    const analysis = await post(app, "/invoices/analyze", { text: demo("01-routine-invoice.ja.txt") });
    expect(analysis.verdict.decision).toBe("hold");
    expect(analysis.kernel.payee).toMatchObject({ tNumber: "T2011001234567", status: "disputed", legalName: null, registeredPayout: null });
    expect(analysis.verdict.reasons).toContainEqual(
      expect.objectContaining({ code: "payee_disputed", legalName: null, message: expect.stringMatching(/^T2011001234567 is frozen by a dispute/u) }),
    );
    expect(JSON.stringify(analysis)).not.toContain(CLAIMANT);
    expect(JSON.stringify(llm.explained)).not.toContain(CLAIMANT);

    const forced = await post(app, `/invoices/${analysis.id}/pay`, { force: true });
    expect(forced).toMatchObject({ status: "reverted", broadcast: false, error: { name: "PayeeNotActive" } });
    expect(JSON.stringify(forced)).not.toContain(CLAIMANT);

    const vault = await (await app.request("/vault")).json();
    expect(vault.vendors[0]).toMatchObject({ tNumber: "T2011001234567", status: "disputed", legalName: null, registeredPayout: null });
    expect(JSON.stringify(vault)).not.toContain(CLAIMANT);
  });
});
