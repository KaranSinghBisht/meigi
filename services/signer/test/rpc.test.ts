import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createPublicClient, custom, HttpRequestError } from "viem";
import { sepolia } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { nextNonce, NONCE_MEMORY_MS } from "../src/payer.js";
import { bench, PRIMARY_TIMEOUT_MS, rpcTransports, Skipped } from "../src/rpc.js";

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

describe("the signer's RPCs when the primary hangs", () => {
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

describe("the signer's RPCs when both are refusing", () => {
  it("still reaches a benched primary last, so the fallback is never the only way to the chain", async () => {
    const { transport } = rpcTransports([urlOf(flaky), urlOf(refusing)]);
    const client = createPublicClient({ chain: sepolia, transport });
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(32n); // 403 benches it; the backup 403s; the primary again
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(32n); // benched: skipped first, then reached last
  });
});

describe("a primary that is back", () => {
  it("is tried first again once it answers as the last resort, instead of waiting out the minute", async () => {
    let primaryCalls = 0;
    let backupCalls = 0;
    const once403 = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        primaryCalls += 1;
        if (primaryCalls === 1) return void res.writeHead(403).end("error code: 1020");
        const { id } = JSON.parse(raw) as { id: number };
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id, result: "0x40" }));
      });
    });
    const counted403 = createServer((_req, res) => ((backupCalls += 1), void res.writeHead(403).end("error code: 1020")));
    await Promise.all([once403, counted403].map((s) => new Promise<void>((resolve) => s.listen(0, "127.0.0.1", () => resolve()))));
    try {
      const client = createPublicClient({ chain: sepolia, transport: rpcTransports([urlOf(once403), urlOf(counted403)]).transport });
      expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(64n); // 403 benches it, the backup refuses, the last resort answers
      expect(backupCalls).toBe(1);
      expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(64n);
      expect(backupCalls).toBe(1); // the bench was lifted: the primary answered first, the backup wasn't asked
    } finally {
      once403.close();
      counted403.close();
    }
  });
});

describe("the fallback URL setting", () => {
  const required = {
    AGENT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    SIGNER_TOKEN: "t".repeat(64),
    SEPOLIA_RPC_URL: "https://rpc.example",
    VAULT_ADDRESS: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B",
  };

  it("treats an empty value as unset, and takes https, or plain http on this machine only", () => {
    expect(loadConfig({ ...required, SEPOLIA_RPC_FALLBACK_URL: "" }).SEPOLIA_RPC_FALLBACK_URL).toBeUndefined();
    expect(loadConfig({ ...required, SEPOLIA_RPC_FALLBACK_URL: "https://sepolia.gateway.tenderly.co" }).SEPOLIA_RPC_FALLBACK_URL).toBe("https://sepolia.gateway.tenderly.co");
    expect(loadConfig({ ...required, SEPOLIA_RPC_FALLBACK_URL: "http://127.0.0.1:8545" }).SEPOLIA_RPC_FALLBACK_URL).toBe("http://127.0.0.1:8545");
    expect(() => loadConfig({ ...required, SEPOLIA_RPC_FALLBACK_URL: "http://rpc.example" })).toThrow(/https, or http on loopback/u);
  });
});

describe("the next payment's nonce", () => {
  it("never goes below the last one sent + 1, whatever an RPC's pending pool says, until the memory lapses", () => {
    expect(nextNonce(7, null, 0)).toBe(7);
    expect(nextNonce(7, { nonce: 7, at: 1_000 }, 2_000)).toBe(8); // this RPC hasn't seen our last transaction yet
    expect(nextNonce(9, { nonce: 7, at: 1_000 }, 2_000)).toBe(9); // it has seen more
    expect(nextNonce(7, { nonce: 7, at: 1_000 }, 1_000 + NONCE_MEMORY_MS + 1)).toBe(7); // a dropped transaction doesn't block for long
  });
});

describe("the bench, on a fake clock", () => {
  it("lifts only for a quick answer: a primary that answers slowly stays skipped", async () => {
    let clock = 0;
    let delay = 0;
    const primary = bench("https://primary.example", () => clock);
    const down = custom({ request: async () => { throw new HttpRequestError({ url: "https://primary.example" }); } }, { retryCount: 0 });
    const answering = custom({ request: async () => ((clock += delay), "0x1") }, { retryCount: 0 });
    const first = primary.benched(down)({ chain: sepolia });
    const last = primary.lifting(answering)({ chain: sepolia });
    const ask = (t: typeof first) => t.request({ method: "eth_blockNumber" });

    await expect(ask(first)).rejects.not.toBeInstanceOf(Skipped); // a real failure: benched from here
    await expect(ask(first)).rejects.toBeInstanceOf(Skipped);
    delay = PRIMARY_TIMEOUT_MS + 500;
    await ask(last); // answered, but slowly
    await expect(ask(first)).rejects.toBeInstanceOf(Skipped); // still benched
    delay = 200;
    await ask(last); // answered quickly
    await expect(ask(first)).rejects.not.toBeInstanceOf(Skipped); // lifted: the first choice is tried (and fails) again
  });
});
