import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analysis/analyze.js";
import { approvalRefusal } from "../src/approval/holds.js";
import { createScanCache } from "../src/screening/cache.js";
import { createIntercepta, type ScreeningPort } from "../src/screening/intercepta.js";
import { demo, fakeDeps, MEIGI_PAYOUT } from "./fakes.js";

/** Review M1: with a key set, screening that can't answer holds; the registered payout is always screened. */

function intercepta(reply: (init: RequestInit) => Response | Promise<Response>) {
  const screened: string[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    screened.push(decodeURIComponent(url.split("/account/")[1]!.split("/")[0]!));
    return reply(init);
  }) as unknown as typeof fetch;
  const port = createIntercepta({ apiKey: "k", cache: createScanCache(null), maxCalls: 900, fetch: fetchImpl, timeoutMs: 50 });
  return { port, screened };
}

const clean = () => new Response(JSON.stringify({ toxicScore: 0, traits: [] }), { status: 200 });
const noAddress = demo("01-routine-invoice.ja.txt").replace(/受取アドレス: 0x[0-9a-fA-F]{40}\n/u, "");

describe("screening fails closed once it is configured", () => {
  it.each([
    ["a 503", () => new Response("down", { status: 503 })],
    ["a timeout", (init: RequestInit) => new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("holds on %s, and a verified human may release it", async (_label, reply) => {
    const deps = { ...fakeDeps(), screening: intercepta(reply).port };
    const stored = await analyzeDocument(deps, demo("01-routine-invoice.ja.txt"));
    expect(stored.verdict.decision).toBe("hold");
    expect(stored.verdict.reasons.map((r) => r.code)).toEqual(["screening_unavailable"]);
    expect(approvalRefusal(stored)).toBeNull();
  });

  it("holds when the screening budget is used up", async () => {
    const port = createIntercepta({ apiKey: "k", cache: createScanCache(null), maxCalls: 0, fetch: clean as unknown as typeof fetch });
    const stored = await analyzeDocument({ ...fakeDeps(), screening: port }, demo("01-routine-invoice.ja.txt"));
    expect(stored.verdict.reasons.map((r) => r.code)).toEqual(["screening_unavailable"]);
  });

  it("screens the registered payout the vault pays, even when the invoice prints no address", async () => {
    const { port, screened } = intercepta(clean);
    const stored = await analyzeDocument({ ...fakeDeps(), screening: port }, noAddress);
    expect(screened.map((a) => a.toLowerCase())).toEqual([MEIGI_PAYOUT.toLowerCase()]);
    expect(stored.verdict.decision).toBe("pay");
  });

  it("only warns without a key, so the demo keeps working", async () => {
    const stored = await analyzeDocument(fakeDeps(), demo("01-routine-invoice.ja.txt"));
    expect(stored.verdict.decision).toBe("pay");
    expect(stored.verdict.warnings.map((w) => w.code)).toContain("screening_not_configured");
  });

  it("holds a flagged registered payout the invoice never printed", async () => {
    const flagged: ScreeningPort = {
      enabled: true,
      async screen(addresses: Address[]) {
        const results = addresses.map((address) => ({ address, toxicScore: 90, traits: [], checkedAt: "", flagged: true, cached: false }));
        return { status: "ok", results, errors: [], callsUsed: 1, callBudget: 900 };
      },
    };
    const stored = await analyzeDocument({ ...fakeDeps(), screening: flagged }, noAddress);
    expect(stored.verdict.reasons.map((r) => r.code)).toEqual(["screening_flagged"]);
    expect(approvalRefusal(stored)).not.toBeNull();
  });
});
