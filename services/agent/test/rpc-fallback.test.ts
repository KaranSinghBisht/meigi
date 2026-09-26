import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClients, PRIMARY_TIMEOUT_MS } from "../src/chain/clients.js";
import { loadConfig } from "../src/config.js";

/** A venue's shared IP gets Cloudflare 403s from a public RPC: reads must carry on through the fallback URL. */

function server(answer: (body: { method: string; id: number }) => { status: number; json?: unknown }) {
  const hits: string[] = [];
  const s: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const parsed = JSON.parse(raw) as { method: string; id: number } | { method: string; id: number }[];
      const calls = Array.isArray(parsed) ? parsed : [parsed];
      hits.push(...calls.map((c) => c.method));
      const replies = calls.map(answer);
      const status = replies[0]!.status;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(status === 200 ? JSON.stringify(Array.isArray(parsed) ? replies.map((r) => r.json) : replies[0]!.json) : "error code: 1020");
    });
  });
  return { s, hits };
}

const primary = server(() => ({ status: 403 })); // what Cloudflare answers a flagged IP
const hung: Server = createServer(() => {}); // accepts the connection and never answers
const backup = server(({ method, id }) => ({ status: 200, json: { jsonrpc: "2.0", id, result: method === "eth_chainId" ? "0xaa36a7" : "0x10" } }));
const urlOf = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

beforeAll(async () => {
  await Promise.all([primary.s, backup.s, hung].map((s) => new Promise<void>((resolve) => s.listen(0, "127.0.0.1", () => resolve()))));
});
afterAll(() => {
  primary.s.close();
  backup.s.close();
  hung.closeAllConnections();
  hung.close();
});

describe("reading Sepolia through a fallback RPC", () => {
  it("answers reads from the fallback while the primary refuses", async () => {
    const { publicClient } = createClients(urlOf(primary.s), 11155111, urlOf(backup.s));
    expect(await publicClient.getBlockNumber()).toBe(16n);
    expect(primary.hits.length).toBeGreaterThan(0);
    expect(backup.hits).toContain("eth_blockNumber");
  });

  it("gives up on a hung primary after one short try, then skips it instead of waiting again", async () => {
    const { publicClient } = createClients(urlOf(hung), 11155111, urlOf(backup.s));
    let started = Date.now();
    expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(16n);
    expect(Date.now() - started).toBeGreaterThanOrEqual(PRIMARY_TIMEOUT_MS - 100);
    expect(Date.now() - started).toBeLessThan(PRIMARY_TIMEOUT_MS + 2_000);
    started = Date.now();
    expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(16n);
    expect(Date.now() - started).toBeLessThan(1_000); // benched for a minute: straight to the fallback
  }, 15_000);

  it("still reaches a benched primary last when the fallback refuses too", async () => {
    let calls = 0;
    const blip = server(({ method, id }) => ((calls += 1), calls === 1 ? { status: 403 } : { status: 200, json: { jsonrpc: "2.0", id, result: method === "eth_chainId" ? "0xaa36a7" : "0x20" } }));
    await new Promise<void>((resolve) => blip.s.listen(0, "127.0.0.1", () => resolve()));
    try {
      const { publicClient } = createClients(urlOf(blip.s), 11155111, urlOf(primary.s)); // this "fallback" always 403s
      expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(32n);
      expect(await publicClient.getBlockNumber({ cacheTime: 0 })).toBe(32n);
    } finally {
      blip.s.close();
    }
  });

  it("fails without one, as before", async () => {
    const { publicClient } = createClients(urlOf(primary.s), 11155111);
    await expect(publicClient.getBlockNumber()).rejects.toThrow();
  });

  it("is optional, and must be https or loopback", () => {
    const env = { SEPOLIA_RPC_URL: "http://127.0.0.1:8547", AGENT_ADDRESS: `0x${"11".repeat(20)}`, SIGNER_TOKEN: "s".repeat(64), REGISTRY_ADDRESS: `0x${"22".repeat(20)}`, VAULT_ADDRESS: `0x${"33".repeat(20)}` };
    expect(loadConfig(env).SEPOLIA_RPC_FALLBACK_URL).toBeUndefined();
    expect(loadConfig({ ...env, SEPOLIA_RPC_FALLBACK_URL: "https://sepolia.gateway.tenderly.co" }).SEPOLIA_RPC_FALLBACK_URL).toBe("https://sepolia.gateway.tenderly.co");
    expect(() => loadConfig({ ...env, SEPOLIA_RPC_FALLBACK_URL: "http://rpc.example.com" })).toThrow("SEPOLIA_RPC_FALLBACK_URL");
  });
});
