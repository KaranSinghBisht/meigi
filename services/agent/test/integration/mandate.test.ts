import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentVaultAbi } from "@meigi/abi";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig as loadSignerConfig, startSigner } from "@meigi/signer";
import { createPublicClient, http, parseEventLogs, type Hex, type PublicClient } from "viem";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasFoundry } from "../../scripts/stack/anvil.js";
import { deployMandate, type MandateWorld } from "../../scripts/stack/mandate.js";
import { agentEnv, signerEnv, startLocalStack, type LocalStack } from "../../scripts/stack/stack.js";
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { buildDeps } from "../../src/wiring.js";
import { FakeTriage, MEIGI_PAYOUT, routineTriage } from "../fakes.js";

/**
 * The ENS mandate end to end on real contracts: the MandateGate is the vault's agent, and the signer (SIGNER_VIA_GATE=1)
 * pays through it while the buyer company's `ap.t4999900000005.payee.eth` answers. The company revokes it: the agent
 * holds, at analysis and at pay time, and nothing is sent. It issues it again: payments continue.
 */
describe.skipIf(!hasFoundry())("paying through the ENS mandate on anvil", () => {
  let stack: LocalStack;
  let world: MandateWorld;
  let signer: ServerType;
  let app: ReturnType<typeof createApp>;
  let reader: PublicClient;
  let dir: string;
  const TOKEN = "t".repeat(64);
  const routine = readFileSync(new URL("../../scripts/demo-invoices/01-routine-invoice.ja.txt", import.meta.url), "utf8");
  const numbered = (n: number) => routine.replace(/請求書番号: MS-2026-\d{4}/u, `請求書番号: MS-2026-${7000 + n}`);

  beforeAll(async () => {
    stack = await startLocalStack({ port: Number(process.env.ANVIL_PORT ?? 8557) });
    world = await deployMandate(stack);
    dir = mkdtempSync(join(tmpdir(), "meigi-mandate-it-"));
    const gated = { SIGNER_VIA_GATE: "1", MANDATE_GATE_ADDRESS: world.gate };
    const started = await startSigner(loadSignerConfig({ ...signerEnv(stack, { port: 8798, token: TOKEN }), ...gated }));
    signer = await new Promise<ServerType>((resolve) => {
      const server = serve({ fetch: started.app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(server));
    });
    const url = `http://127.0.0.1:${(signer.address() as AddressInfo).port}`;
    const config = loadConfig({
      ...agentEnv(stack, { url, token: TOKEN }),
      ...gated,
      LLM_PROVIDER: "none",
      INTERCEPTA_CACHE_PATH: join(dir, "intercepta.json"),
      AUDIT_LOG_PATH: join(dir, "audit.jsonl"),
    });
    const { deps, init } = buildDeps(config);
    await init();
    app = createApp({ ...deps, triage: new FakeTriage(routineTriage()) });
    reader = createPublicClient({ chain: foundry, transport: http(stack.anvil.url) }) as PublicClient;
  });

  afterAll(() => {
    signer?.close();
    stack?.anvil.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function call(method: string, path: string, body?: unknown): Promise<Record<string, any>> {
    const init = body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
    return (await (await app.request(path, init)).json()) as Record<string, any>;
  }
  const analyze = (n: number) => call("POST", "/invoices/analyze", { text: numbered(n) });
  const agentNonce = () => reader.getTransactionCount({ address: stack.accounts.agent.address });

  it("pays through the gate while the mandate answers: the vault emits InvoicePaid as before", async () => {
    const analysis = await analyze(1);
    expect(analysis.verdict).toMatchObject({ decision: "pay", reasons: [] });
    expect(analysis.kernel.checks).toContainEqual(expect.objectContaining({ code: "mandate_live", ok: true }));
    const paid = await call("POST", `/invoices/${analysis.id}/pay`, {});
    expect(paid).toMatchObject({ status: "paid", payTo: MEIGI_PAYOUT });
    const tx = await reader.getTransaction({ hash: paid.txHash as Hex });
    expect(tx.to?.toLowerCase()).toBe(world.gate.toLowerCase()); // sent to the gate, not the vault
    const receipt = await reader.getTransactionReceipt({ hash: paid.txHash as Hex });
    const [event] = parseEventLogs({ abi: agentVaultAbi, eventName: "InvoicePaid", logs: receipt.logs });
    expect(event?.address.toLowerCase()).toBe(stack.deployment.vault.toLowerCase());
    expect(await call("GET", "/vault")).toMatchObject({ agentAuthorized: true, mandate: { gate: world.gate, name: world.name, live: true } });
  });

  it("holds cleanly, sending nothing, once the company revokes the mandate: at analysis and at pay time", async () => {
    const before = await agentNonce();
    const stale = await analyze(2); // analysed while the mandate answered
    expect(stale.verdict.decision).toBe("pay");
    await world.revoke();
    const held = await call("POST", `/invoices/${stale.id}/pay`, {});
    expect(held).toMatchObject({ status: "held", reasons: [{ code: "mandate_not_live", revert: "MandateNotLive" }] });
    expect(held.reasons[0].message).toContain(world.name);
    const fresh = await analyze(3);
    expect(fresh.verdict.decision).toBe("hold");
    expect(fresh.verdict.reasons).toContainEqual(expect.objectContaining({ code: "mandate_not_live", revert: "MandateNotLive" }));
    expect(await agentNonce()).toBe(before); // nothing was signed or sent
    const audit = await call("GET", "/audit?limit=50&verify=1");
    expect(audit.chain.ok).toBe(true);
    expect(audit.entries).toContainEqual(expect.objectContaining({ event: "payment", status: "held", reasons: [expect.objectContaining({ code: "mandate_not_live" })] }));
    expect(audit.entries).toContainEqual(expect.objectContaining({ event: "signer.simulate", simulation: { ok: false, revert: "MandateNotLive" } }));
  });

  it("pays again once the company issues the mandate again", async () => {
    await world.issue();
    const analysis = await analyze(4);
    expect(analysis.verdict.decision).toBe("pay");
    expect(await call("POST", `/invoices/${analysis.id}/pay`, {})).toMatchObject({ status: "paid" });
  });

  it("won't start a signer whose setting doesn't match the chain: flag off with the gate wired, or a dark mandate", async () => {
    await expect(startSigner(loadSignerConfig(signerEnv(stack, { port: 8798, token: TOKEN })))).rejects.toThrow(/but the vault's agent is/u);
    const off = { ...signerEnv(stack, { port: 8798, token: TOKEN }), MANDATE_GATE_ADDRESS: world.gate }; // SIGNER_VIA_GATE defaults to 0
    await expect(startSigner(loadSignerConfig(off))).rejects.toThrow(/set SIGNER_VIA_GATE=1/u);
    await world.revoke();
    const gated = { SIGNER_VIA_GATE: "1", MANDATE_GATE_ADDRESS: world.gate };
    await expect(startSigner(loadSignerConfig({ ...signerEnv(stack, { port: 8798, token: TOKEN }), ...gated }))).rejects.toThrow(/doesn't answer/u);
    await world.issue();
  });
});
