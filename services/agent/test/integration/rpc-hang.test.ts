import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig as loadSignerConfig, startSigner } from "@meigi/signer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasFoundry } from "../../scripts/stack/anvil.js";
import { agentEnv, signerEnv, startLocalStack, type LocalStack } from "../../scripts/stack/stack.js";
import { createApp } from "../../src/app.js";
import { loadConfig } from "../../src/config.js";
import { buildDeps } from "../../src/wiring.js";
import { FakeTriage, MEIGI_PAYOUT, routineTriage } from "../fakes.js";

/**
 * A primary RPC that accepts connections and never answers, with anvil as SEPOLIA_RPC_FALLBACK_URL: the signer starts,
 * and the agent analyses and pays, in seconds. Each side waits out one short try on the primary, then skips it.
 */
describe.skipIf(!hasFoundry())("paying on anvil while the primary RPC hangs", () => {
  let stack: LocalStack;
  let hung: Server;
  let signer: ServerType;
  let app: ReturnType<typeof createApp>;
  let dir: string;
  let startupMs = 0;
  const TOKEN = "t".repeat(64);
  const routine = readFileSync(new URL("../../scripts/demo-invoices/01-routine-invoice.ja.txt", import.meta.url), "utf8");

  beforeAll(async () => {
    stack = await startLocalStack({ port: Number(process.env.ANVIL_PORT_HANG ?? 8567) });
    hung = createServer(() => {});
    await new Promise<void>((resolve) => hung.listen(0, "127.0.0.1", () => resolve()));
    const rpcs = { SEPOLIA_RPC_URL: `http://127.0.0.1:${(hung.address() as AddressInfo).port}`, SEPOLIA_RPC_FALLBACK_URL: stack.anvil.url };
    dir = mkdtempSync(join(tmpdir(), "meigi-hang-it-"));
    const started = Date.now();
    const signed = await startSigner(loadSignerConfig({ ...signerEnv(stack, { port: 8798, token: TOKEN }), ...rpcs }));
    startupMs = Date.now() - started;
    signer = await new Promise<ServerType>((resolve) => {
      const server = serve({ fetch: signed.app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(server));
    });
    const config = loadConfig({
      ...agentEnv(stack, { url: `http://127.0.0.1:${(signer.address() as AddressInfo).port}`, token: TOKEN }),
      ...rpcs,
      LLM_PROVIDER: "none",
      INTERCEPTA_CACHE_PATH: join(dir, "intercepta.json"),
      AUDIT_LOG_PATH: join(dir, "audit.jsonl"),
    });
    const { deps, init } = buildDeps(config);
    await init();
    app = createApp({ ...deps, triage: new FakeTriage(routineTriage()) });
  });

  afterAll(() => {
    signer?.close();
    hung?.closeAllConnections();
    hung?.close();
    stack?.anvil.stop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function call(method: string, path: string, body?: unknown): Promise<Record<string, any>> {
    const init = body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
    return (await (await app.request(path, init)).json()) as Record<string, any>;
  }

  it("starts the signer, analyses and pays through the fallback, far inside the agent's 30 s signer timeout", async () => {
    expect(startupMs).toBeGreaterThanOrEqual(3_900); // it did wait out one try on the hung primary
    expect(startupMs).toBeLessThan(10_000); // one short try, then the fallback, with the primary skipped after
    let started = Date.now();
    const analysis = await call("POST", "/invoices/analyze", { text: routine.replace(/請求書番号: MS-2026-\d{4}/u, "請求書番号: MS-2026-7301") });
    expect(analysis.verdict).toMatchObject({ decision: "pay", reasons: [] });
    expect(Date.now() - started).toBeLessThan(10_000);
    started = Date.now();
    const paid = await call("POST", `/invoices/${analysis.id}/pay`, {});
    expect(paid).toMatchObject({ status: "paid", payTo: MEIGI_PAYOUT });
    expect(Date.now() - started).toBeLessThan(10_000); // the signer skips the benched primary for the whole payment
  });
});
