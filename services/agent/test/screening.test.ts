import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createScanCache } from "../src/screening/cache.js";
import { createIntercepta } from "../src/screening/intercepta.js";
import { MEIGI_PAYOUT, SCAMMER } from "./fakes.js";

function fakeApi(bodies: Record<string, unknown>) {
  const calls: { url: string; key: string | undefined }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url, key: headers["X-API-KEY"] });
    const address = decodeURIComponent(url.split("/account/")[1]!.split("/")[0]!);
    return new Response(JSON.stringify(bodies[address] ?? { toxicScore: 0, traits: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const scammer = { toxicScore: 92, traits: [{ name: "known_scammer", risk: 5, txsCount: 14, description: "Reported scam address" }] };

describe("Intercepta screening", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  it("says 'screening not configured' without a key and never invents a result", async () => {
    const port = createIntercepta({ apiKey: undefined, cache: createScanCache(null), maxCalls: 900 });
    expect(await port.screen([SCAMMER])).toEqual({ status: "not_configured", message: "screening not configured", reason: "no INTERCEPTA_API_KEY is configured" });
  });

  it("re-checks a clean result after 10 minutes, and keeps a flagged one", async () => {
    const { fetchImpl, calls } = fakeApi({ [SCAMMER]: scammer });
    let now = Date.parse("2026-09-26T03:00:00Z");
    const port = createIntercepta({ apiKey: "k", cache: createScanCache(null), maxCalls: 900, fetch: fetchImpl, now: () => now });
    await port.screen([MEIGI_PAYOUT, SCAMMER]);
    now += 9 * 60 * 1000;
    expect(await port.screen([MEIGI_PAYOUT])).toMatchObject({ results: [{ cached: true }] });
    now += 2 * 60 * 1000;
    expect(await port.screen([MEIGI_PAYOUT, SCAMMER])).toMatchObject({ results: [{ cached: false, flagged: false }, { cached: true, flagged: true }] });
    expect(calls.map((c) => c.url.includes(MEIGI_PAYOUT))).toEqual([true, false, true]);
  });

  it("flags scam traits, sends the key header and caches by address", async () => {
    const { fetchImpl, calls } = fakeApi({ [SCAMMER]: scammer });
    const port = createIntercepta({ apiKey: "w3a-key", cache: createScanCache(null), maxCalls: 900, fetch: fetchImpl });
    const first = await port.screen([SCAMMER, MEIGI_PAYOUT]);
    expect(first).toMatchObject({
      status: "ok",
      callsUsed: 2,
      results: [
        { address: SCAMMER, toxicScore: 92, flagged: true, cached: false, traits: [{ name: "known_scammer" }] },
        { address: MEIGI_PAYOUT, toxicScore: 0, flagged: false, cached: false },
      ],
    });
    expect(calls[0]).toEqual({ url: `https://api.web3antivirus.io/api/public/v2/extension/account/${SCAMMER}/quick-scan`, key: "w3a-key" });
    const again = await port.screen([SCAMMER.toLowerCase() as `0x${string}`]);
    expect(again).toMatchObject({ status: "ok", results: [{ cached: true, flagged: true }] });
    expect(calls).toHaveLength(2);
  });

  it("flags from toxicScore 50, or on a trait never acceptable in a payee", async () => {
    const { fetchImpl } = fakeApi({
      [SCAMMER]: { toxicScore: 40, traits: [] },
      [MEIGI_PAYOUT]: { toxicScore: 10, traits: [{ name: "sanction_address", risk: 5, txsCount: 1, description: "" }] },
    });
    const port = createIntercepta({ apiKey: "k", cache: createScanCache(null), maxCalls: 900, fetch: fetchImpl });
    const screened = await port.screen([SCAMMER, MEIGI_PAYOUT]);
    expect(screened.status === "ok" && screened.results.map((r) => r.flagged)).toEqual([false, true]);
  });

  it("stops calling at the budget and keeps serving cached results", async () => {
    const { fetchImpl, calls } = fakeApi({});
    const port = createIntercepta({ apiKey: "k", cache: createScanCache(null), maxCalls: 1, fetch: fetchImpl });
    await port.screen([MEIGI_PAYOUT]);
    expect(await port.screen([SCAMMER])).toMatchObject({ status: "unavailable", reason: "the 1-call screening budget is used up" });
    expect(await port.screen([MEIGI_PAYOUT])).toMatchObject({ status: "ok", results: [{ cached: true }] });
    expect(calls).toHaveLength(1);
  });

  it("persists results and the call count across restarts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meigi-screening-"));
    dirs.push(dir);
    const path = join(dir, "nested", "intercepta-cache.json");
    const { fetchImpl, calls } = fakeApi({ [SCAMMER]: scammer });
    await createIntercepta({ apiKey: "k", cache: createScanCache(path), maxCalls: 900, fetch: fetchImpl }).screen([SCAMMER]);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved).toMatchObject({ version: 1, calls: 1, entries: { [SCAMMER.toLowerCase()]: { toxicScore: 92 } } });
    const restarted = createIntercepta({ apiKey: "k", cache: createScanCache(path), maxCalls: 900, fetch: fetchImpl });
    expect(await restarted.screen([SCAMMER])).toMatchObject({ results: [{ cached: true, flagged: true }], callsUsed: 1 });
    expect(calls).toHaveLength(1);
  });

  it("reports HTTP errors per address", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
    const port = createIntercepta({ apiKey: "bad", cache: createScanCache(null), maxCalls: 900, fetch: fetchImpl });
    expect(await port.screen([SCAMMER])).toMatchObject({ status: "unavailable", reason: "Intercepta answered 403" });
  });
});
