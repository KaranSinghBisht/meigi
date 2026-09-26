import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Screening, ScreeningPort } from "../src/screening/intercepta.js";
import { demo, fakeDeps } from "./fakes.js";

/** The Ronin bridge exploiter: what Intercepta returned for it live on 2026-09-26. */
const RONIN = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96";
const RONIN_TRAITS = ["known_scammer", "sanction_address", "blacklist"];

/** Screens as Intercepta did live: the exploiter is flagged with toxic score 100, every other address is clean. */
function liveScreening(): ScreeningPort {
  return {
    enabled: true,
    async screen(addresses: Address[]): Promise<Screening> {
      const results = addresses.map((address) => {
        const bad = address.toLowerCase() === RONIN.toLowerCase();
        const traits = bad ? RONIN_TRAITS.map((name) => ({ name, risk: 100, txsCount: null, description: null })) : [];
        return { address, toxicScore: bad ? 100 : 0, traits, checkedAt: "2026-09-26T05:40:00.000Z", flagged: bad, cached: false };
      });
      return { status: "ok", results, errors: [], callsUsed: results.length, callBudget: 900 };
    },
  };
}

describe("example 08: a bank-change email to a flagged wallet", () => {
  it("holds on the kernel's PayeeMismatch and Intercepta's known_scammer flag, and force is refused unsimulated", async () => {
    const deps = { ...fakeDeps(), screening: liveScreening() };
    const app = createApp(deps);
    const post = async (path: string, body: unknown) =>
      (await (await app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })).json()) as Record<string, any>;

    const analysis = await post("/invoices/analyze", { text: demo("08-bank-change-flagged-wallet.ja.txt") });
    const reason = (code: string) => analysis.verdict.reasons.find((r: { code: string }) => r.code === code);
    expect(analysis.verdict.decision).toBe("hold");
    expect(analysis.extracted).toMatchObject({ tNumber: "T2011001234567", address: RONIN, invoiceNumber: "MS-2026-1008", amount: { display: "¥96,800" } });
    expect(reason("payout_mismatch")).toMatchObject({ layer: "kernel", revert: "PayeeMismatch" });
    expect(reason("screening_flagged")).toMatchObject({
      layer: "screening",
      message: `Intercepta flags ${RONIN} (toxic score 100; known_scammer, sanction_address, blacklist).`,
    });
    expect(analysis.approval).toMatchObject({ approvable: false }); // no person can release a screening hit

    const forced = await post(`/invoices/${analysis.id}/pay`, { force: true });
    expect(forced).toMatchObject({ status: "held", reasons: [{ code: "force_refused", message: "Force can't override these holds: screening_flagged." }] });
    expect(deps.payer.simulated).toEqual([]);
    expect(deps.payer.sent).toEqual([]);
  });
});
