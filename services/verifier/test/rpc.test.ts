import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createPublicClient, HttpRequestError } from "viem";
import { sepolia } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRIMARY_TIMEOUT_MS, rpcTransports } from "../src/registry/rpc.js";

/** A primary that accepts connections and never answers, and a backup that answers every call. */
const hung: Server = createServer(() => {});
const backup: Server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const { id, method } = JSON.parse(raw) as { id: number; method: string };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result: method === "eth_chainId" ? "0xaa36a7" : "0x10" }));
  });
});
/** A primary that answers 403 once (a Cloudflare blip), then works; and a backup that is refusing too. */
let blips = 0;
const flaky: Server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    blips += 1;
    if (blips === 1) return void res.writeHead(403).end("error code: 1020");
    const { id } = JSON.parse(raw) as { id: number };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id, result: "0x20" }));
  });
});
const refusing: Server = createServer((_req, res) => void res.writeHead(403).end("error code: 1020"));
const urlOf = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

beforeAll(async () => {
  await Promise.all([hung, backup, flaky, refusing].map((s) => new Promise<void>((resolve) => s.listen(0, "127.0.0.1", () => resolve()))));
});
afterAll(() => {
  hung.closeAllConnections();
  hung.close();
  for (const s of [backup, flaky, refusing]) s.close();
});

describe("the verifier's RPCs when the primary hangs", () => {
  it("fails over after one short try, then skips the primary instead of waiting on it again", async () => {
    const { transport, each } = rpcTransports([urlOf(hung), urlOf(backup)]);
    const client = createPublicClient({ chain: sepolia, transport });
    let started = Date.now();
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(16n);
    expect(Date.now() - started).toBeGreaterThanOrEqual(PRIMARY_TIMEOUT_MS - 100);
    expect(Date.now() - started).toBeLessThan(PRIMARY_TIMEOUT_MS + 2_000);
    started = Date.now();
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(16n);
    expect(Date.now() - started).toBeLessThan(1_000); // benched: straight to the backup
    // broadcast.ts sees the benched primary fail as a transport error at once, and moves on to the backup
    const alone = createPublicClient({ chain: sepolia, transport: each[0]! });
    started = Date.now();
    await expect(alone.getBlockNumber({ cacheTime: 0 })).rejects.toBeInstanceOf(HttpRequestError);
    expect(Date.now() - started).toBeLessThan(1_000);
  }, 15_000);
});

describe("the verifier's RPCs when both are refusing", () => {
  it("still reaches a benched primary last, so the fallback is never the only way to the chain", async () => {
    const { transport } = rpcTransports([urlOf(flaky), urlOf(refusing)]);
    const client = createPublicClient({ chain: sepolia, transport });
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(32n); // 403 benches it; the backup 403s; the primary again
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(32n); // benched: skipped first, then reached last
  });
});
