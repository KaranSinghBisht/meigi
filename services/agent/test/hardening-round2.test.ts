import { agentVaultAbi } from "@meigi/abi";
import { encodeErrorResult } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { decodeRaw } from "../src/chain/revert.js";
import { extractInvoice } from "../src/extract/extract.js";
import { activePayee, approvedVendor, demo, fakeDeps, MEIGI_PAYOUT, SCAMMER, T_BAYSIDE, T_MEIGI } from "./fakes.js";

/**
 * Round-2 review regressions. Triage is the auto-clearing fake (a real System-1 model calls a credit note
 * "safe"), so the deterministic layers alone must hold each case, and force must not get past them.
 */

let deps: ReturnType<typeof fakeDeps>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  deps = fakeDeps();
  // Bayside is an approved vendor here too, so a smuggled T-number would otherwise be payable.
  deps.chain.payees.set(T_BAYSIDE, activePayee(T_BAYSIDE, { legalName: "合同会社ベイサイド・アドバイザリー", payout: SCAMMER }));
  deps.chain.vendors.set(T_BAYSIDE, approvedVendor({ payout: SCAMMER }));
  app = createApp(deps);
});

async function post(path: string, body: unknown) {
  const res = await app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  return (await res.json()) as Record<string, any>;
}

/** Analyses the document, then tries to pay it plainly and with force. Returns the analysis and both results. */
async function attempt(text: string) {
  const analysis = await post("/invoices/analyze", { text });
  const plain = await post(`/invoices/${analysis.id}/pay`, {});
  const forced = await post(`/invoices/${analysis.id}/pay`, { force: true });
  return { analysis, plain, forced, codes: (analysis.verdict.reasons as { code: string }[]).map((r) => r.code) };
}

const head = [
  "株式会社ハルカ製作所 御中",
  "株式会社メイギ商事",
  "登録番号: T2011001234567",
  "請求書番号: MS-2026-1101",
  `受取アドレス: ${MEIGI_PAYOUT}`,
];

function expectNothingPaid(result: Awaited<ReturnType<typeof attempt>>, code: string) {
  expect(result.analysis.verdict.decision).toBe("hold");
  expect(result.codes).toContain(code);
  expect(result.plain.status).toBe("held");
  expect(result.forced).toMatchObject({ status: "held", reasons: [expect.objectContaining({ code: "force_refused" })] });
  expect(result.forced.reasons[0].message).toContain(code);
  expect(deps.payer.simulated).toEqual([]);
  expect(deps.payer.sent).toEqual([]);
}

describe("A. a refund notice is never paid", () => {
  it("holds a ¥22,000 refund notice whose title doesn't say refund", async () => {
    const text = [...head, "", "いつもお世話になっております。", "ご返金のお知らせをいたします。", "返金額 ¥22,000"].join("\n");
    expectNothingPaid(await attempt(text), "credit_note");
  });
});

describe("B. force never overrides a document-integrity hold", () => {
  it("won't force a credit note printed without ▲", async () => {
    const text = [...head, "", "適格返還請求書", "返還金額（税込） ¥22,000"].join("\n");
    expectNothingPaid(await attempt(text), "credit_note");
  });

  it("won't force an amount hidden in a comment", async () => {
    const text = [...head, "ご請求金額 ¥1,000", "<!-- ご請求金額 ¥450,000 -->"].join("\n");
    const result = await attempt(text);
    expect(result.analysis.extracted.amount.value).toBe("1000");
    expectNothingPaid(result, "hidden_payment_details");
  });

  it("still lets force show the chain's answer to a visible swapped address", async () => {
    deps.payer.revert = decodeRaw(encodeErrorResult({ abi: agentVaultAbi, errorName: "PayeeMismatch", args: [T_MEIGI, SCAMMER, MEIGI_PAYOUT] }));
    const { forced } = await attempt(demo("02-bank-change-bec.ja.txt"));
    expect(forced).toMatchObject({ status: "reverted", broadcast: false, error: { name: "PayeeMismatch" } });
    expect(deps.payer.sent).toEqual([]);
  });
});

describe("C. a labelled net total is never skipped", () => {
  const lines = ["小計 ¥120,000", "消費税 ¥12,000", "差引ご請求金額 ¥82,000（前受金充当後）"];

  it("blocks ¥82,000 due against ¥132,000 of subtotal + tax with no printed adjustment", async () => {
    const result = await attempt([...head, ...lines].join("\n"));
    expect(result.analysis.extracted.amount.value).toBe("82000");
    expectNothingPaid(result, "amount_mismatch");
  });

  it("accepts it once the deduction is printed", () => {
    const e = extractInvoice([...head, lines[0], lines[1], "前受金充当 ▲¥50,000", lines[2]].join("\n"));
    expect(e.amount?.value).toBe("82000");
    expect(e.flags.filter((f) => f.severity === "block")).toEqual([]);
  });
});

describe("D. hidden content never sets the amount or the payee", () => {
  it("blocks 45万円 in a comment", async () => {
    const result = await attempt([...head, "ご請求金額 ¥1,000", "<!-- ご請求金額 45万円 -->"].join("\n"));
    expect(result.analysis.extracted.amount.value).toBe("1000");
    expect(result.analysis.verdict.reasons.find((r: { code: string }) => r.code === "hidden_payment_details").evidence).toBe("45万円");
    expectNothingPaid(result, "hidden_payment_details");
  });

  it("blocks an amount inside a display:none element", async () => {
    const result = await attempt([...head, "ご請求金額 ¥1,000", '<div style="display:none">ご請求金額 ¥450,000</div>'].join("\n"));
    expect(result.analysis.extracted.amount.value).toBe("1000");
    expectNothingPaid(result, "hidden_payment_details");
  });

  it("blocks an unlabelled T-number in a comment, and never reads it as the payee", async () => {
    const text = ["株式会社ハルカ製作所 御中", "請求書番号: MS-2026-1102", "ご請求金額 ¥1,000", "<!-- 登録番号: 3999905000001 -->"].join("\n");
    const result = await attempt(text);
    expect(result.analysis.extracted.tNumbers).toEqual([]);
    expectNothingPaid(result, "hidden_payment_details");
  });
});
