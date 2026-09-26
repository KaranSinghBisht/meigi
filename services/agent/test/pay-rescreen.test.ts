import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analysis/analyze.js";
import { payAnalysis } from "../src/analysis/pay.js";
import { createScanCache } from "../src/screening/cache.js";
import { createIntercepta } from "../src/screening/intercepta.js";
import { demo, fakeDeps, FakePayer, MEIGI_PAYOUT } from "./fakes.js";

/** Audit M1 (TOCTOU): a verdict can be minutes old, so the payout is screened again, freshly, right before sending. */

function intercepta() {
  const state = { reply: "clean" as "clean" | "flagged" | "down", calls: [] as string[] };
  const fetchImpl = (async (url: string) => {
    state.calls.push(decodeURIComponent(url.split("/account/")[1]!.split("/")[0]!).toLowerCase());
    if (state.reply === "down") return new Response("down", { status: 503 });
    return new Response(JSON.stringify({ toxicScore: state.reply === "flagged" ? 90 : 0, traits: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  const port = createIntercepta({ apiKey: "k", cache: createScanCache(null), maxCalls: 900, fetch: fetchImpl, timeoutMs: 50 });
  return { port, state };
}

async function analysed() {
  const { port, state } = intercepta();
  const payer = new FakePayer();
  const deps = { ...fakeDeps({ payer }), screening: port };
  const stored = await analyzeDocument(deps, demo("01-routine-invoice.ja.txt"));
  expect(stored.verdict.decision).toBe("pay");
  return { deps, stored, payer, state };
}

describe("the payout is screened again right before a payment is sent", () => {
  it("holds a payout flagged since the analysis, even with its clean result still cached, and sends nothing", async () => {
    const { deps, stored, payer, state } = await analysed();
    const before = state.calls.length;
    state.reply = "flagged";
    const result = await payAnalysis(deps, stored, "auto", () => {});
    expect(result).toMatchObject({ status: "held", reasons: [{ code: "screening_flagged", layer: "screening", legalName: "株式会社メイギ商事" }] });
    expect(state.calls.slice(before)).toEqual([MEIGI_PAYOUT.toLowerCase()]); // asked Intercepta again, not the cache
    expect(payer.sent).toEqual([]);
  });

  it("holds when the payout can't be screened again, and sends nothing", async () => {
    const { deps, stored, payer, state } = await analysed();
    state.reply = "down";
    expect(await payAnalysis(deps, stored, "auto", () => {})).toMatchObject({ status: "held", reasons: [{ code: "screening_unavailable" }] });
    expect(payer.sent).toEqual([]);
  });

  it("pays when the payout is still clean", async () => {
    const { deps, stored, payer } = await analysed();
    expect(await payAnalysis(deps, stored, "auto", () => {})).toMatchObject({ status: "paid" });
    expect(payer.sent).toHaveLength(1);
  });

  it("re-screens a human-approved payment too; force never gets that far, since it never sends", async () => {
    const { deps, stored, payer, state } = await analysed();
    state.reply = "flagged";
    expect(await payAnalysis(deps, stored, "approved", () => {}, { idToken: "t" })).toMatchObject({ status: "held" });
    expect(payer.sent).toEqual([]);
  });

  it("asks nothing more when screening isn't configured, as at analysis", async () => {
    const payer = new FakePayer();
    const deps = fakeDeps({ payer });
    const stored = await analyzeDocument(deps, demo("01-routine-invoice.ja.txt"));
    expect(await payAnalysis(deps, stored, "auto", () => {})).toMatchObject({ status: "paid" });
  });
});
