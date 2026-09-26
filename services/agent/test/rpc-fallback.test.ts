import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClients } from "../src/chain/clients.js";
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
const backup = server(({ method, id }) => ({ status: 200, json: { jsonrpc: "2.0", id, result: method === "eth_chainId" ? "0xaa36a7" : "0x10" } }));
const urlOf = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

beforeAll(async () => {
  await Promise.all([primary.s, backup.s].map((s) => new Promise<void>((resolve) => s.listen(0, "127.0.0.1", () => resolve()))));
});
afterAll(() => {
  primary.s.close();
  backup.s.close();
});

describe("reading Sepolia through a fallback RPC", () => {
  it("answers reads from the fallback while the primary refuses", async () => {
    const { publicClient } = createClients(urlOf(primary.s), 11155111, urlOf(backup.s));
    expect(await publicClient.getBlockNumber()).toBe(16n);
    expect(primary.hits.length).toBeGreaterThan(0);
    expect(backup.hits).toContain("eth_blockNumber");
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
