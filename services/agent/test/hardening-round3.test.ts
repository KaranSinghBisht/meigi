import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { extractInvoice } from "../src/extract/extract.js";
import { fakeDeps, FakeTriage, MEIGI_PAYOUT, routineTriage, yen } from "./fakes.js";

/**
 * Round-3 review regressions, each reproduced with triage auto-clearing: every case once paid the wrong
 * amount through a plain /pay. Now each holds, force is refused, and nothing is simulated or sent.
 */

let deps: ReturnType<typeof fakeDeps>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  deps = fakeDeps();
  app = createApp(deps);
});

async function post(path: string, body: unknown) {
  const res = await app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  return (await res.json()) as Record<string, any>;
}

async function attempt(text: string) {
  const analysis = await post("/invoices/analyze", { text });
  const plain = await post(`/invoices/${analysis.id}/pay`, {});
  const forced = await post(`/invoices/${analysis.id}/pay`, { force: true });
  return { analysis, plain, forced, codes: (analysis.verdict.reasons as { code: string }[]).map((r) => r.code) };
}

function expectNothingPaid(result: Awaited<ReturnType<typeof attempt>>, code: string) {
  expect(result.analysis.verdict.decision).toBe("hold");
  expect(result.codes).toContain(code);
  expect(result.plain.status).toBe("held");
  expect(result.forced).toMatchObject({ status: "held", reasons: [expect.objectContaining({ code: "force_refused" })] });
  expect(deps.payer.simulated).toEqual([]);
  expect(deps.payer.sent).toEqual([]);
}

const head = ["株式会社メイギ商事", "登録番号: T2011001234567", "請求書番号: MS-2026-1201", `受取アドレス: ${MEIGI_PAYOUT}`];
const hidden450 = "ご請求金額 ¥450,000";

describe("D. any HTML beyond bare formatting tags blocks, however the text is hidden", () => {
  const variants: [string, string][] = [
    ["a CSS class", `<style>.h{display:none}</style><span class="h">${hidden450}</span>`],
    ["an unquoted style", `<div style=display:none>${hidden450}</div>`],
    ["a <font> colour", `<font color="#ffffff">${hidden450}</font>`],
    ["a <template>", `<template>${hidden450}</template>`],
    ["near-white text", `<span style="color:#fefefe">${hidden450}</span>`],
    ["a 1px font", `<span style="font-size:1px">${hidden450}</span>`],
    ["an entity-encoded style", `<span style="display&#58;none">${hidden450}</span>`],
    ["a '>' inside an earlier attribute", `<span title="a>b" style="display:none">${hidden450}</span>`],
    ["a closing-tag prefix", `<s style="display:none"></span>${hidden450}</s>`],
    ["a '<' inside a quoted attribute", `<span title="<" style="font-size:1px">${hidden450}</span>`],
    ["over 400 characters of attributes", `<span data-x="${"a".repeat(500)}" style="font-size:1px">${hidden450}</span>`],
    ["a bogus comment", `<!x ${hidden450}>`],
    ["a doctype", `<!DOCTYPE ${hidden450}>`],
    ["a CDATA section", `<![CDATA[${hidden450}]]>`],
    ["a processing instruction", `<?x ${hidden450}?>`],
    ["a closing tag with a space", `</ ${hidden450}>`],
    ["an HTML comment", `<!-- ${hidden450} -->`],
  ];
  for (const [label, html] of variants) {
    it(`holds ${label}`, async () => {
      expectNothingPaid(await attempt([...head, html].join("\n")), "html_markup");
    });
  }

  it("still accepts bare formatting tags and e-mail addresses in angle brackets", async () => {
    const text = ["From: 経理部 <keiri@meigi-shoji.example>", "<p>請求書</p>", ...head, "<b>ご請求金額 ¥1,000</b>"].join("\n");
    const { analysis } = await attempt(text);
    expect(analysis.verdict.reasons.map((r: { code: string }) => r.code)).not.toContain("html_markup");
    expect(analysis.verdict.decision).toBe("pay");
  });
});

describe("bidirectional controls block: what a person reads must be what the agent reads", () => {
  it("holds right-to-left override digits", async () => {
    expectNothingPaid(await attempt([...head, "ご請求金額 ¥\u202E000,054"].join("\n")), "bidi_control");
  });
});

describe("C. a total line with more than one amount is ambiguous", () => {
  it("won't pay a settled previous balance printed beside the total", async () => {
    expectNothingPaid(await attempt([...head, "ご請求金額（消費税込）¥132,000（前月分 ¥450,000 は入金済みです）"].join("\n")), "amount_ambiguous");
  });

  it("won't pay a shipping figure printed beside the total", async () => {
    expectNothingPaid(await attempt([...head, "ご請求金額（消費税込）¥132,000（うち送料 ¥1,000）"].join("\n")), "amount_ambiguous");
  });

  it("won't let a leading 内消費税込 mark the total as the tax figure", async () => {
    expectNothingPaid(await attempt([...head, "内消費税込 合計 ¥132,000 ¥12,000"].join("\n")), "amount_ambiguous");
  });

  it("still reads a tax-included figure printed right after its marker", () => {
    for (const line of ["ご請求金額 ¥132,000（うち消費税 ¥12,000）", "合計 (内消費税 ¥12,000) ¥132,000", "合計 ¥132,000 内消費税: ¥12,000"]) {
      expect(extractInvoice([...head, line].join("\n")).amount?.value).toBe("132000");
    }
  });

  it("pays the common '（消費税込）' label with its single amount", async () => {
    const { analysis, plain } = await attempt([...head, "ご請求金額（消費税込）¥132,000"].join("\n"));
    expect(analysis.verdict).toMatchObject({ decision: "pay", reasons: [] });
    expect(plain.status).toBe("paid");
    expect(deps.payer.sent[0]?.amount).toBe(yen(132_000));
  });
});

describe("A. refunds are never paid, whatever words they use", () => {
  it("holds a cancellation refund worded 払い戻し", async () => {
    const text = [...head, "キャンセル分の払い戻しについてご連絡いたします。", "お振込金額 ¥22,000"].join("\n");
    expectNothingPaid(await attempt(text), "credit_note");
  });

  it("holds an English reimbursement even with 'Amount due'", async () => {
    const text = [...head, "We will reimburse the overcharge.", "Amount due: ¥22,000"].join("\n");
    expectNothingPaid(await attempt(text), "credit_note");
  });

  it("holds whatever System-1 reads as a credit note, even with no refund word at all", async () => {
    deps.triage.result = routineTriage({
      requestType: { value: "credit_note", confidence: 0.96, probabilities: { credit_note: 0.97 } },
    });
    expectNothingPaid(await attempt([...head, "ご請求金額 ¥22,000"].join("\n")), "triage_credit_note");
  });

  it("accepts 'Payment due' as billing wording", async () => {
    const text = [...head.filter((l) => !l.startsWith("請求書番号")), "Payment due: ¥1,000"].join("\n");
    const { analysis } = await attempt(text);
    expect(analysis.verdict.reasons.map((r: { code: string }) => r.code)).not.toContain("no_bill_wording");
  });

  it("holds a document that never asks for payment", async () => {
    const text = ["株式会社メイギ商事", "登録番号: T2011001234567", "お振込金額 ¥22,000", `受取アドレス: ${MEIGI_PAYOUT}`].join("\n");
    expectNothingPaid(await attempt(text), "no_bill_wording");
  });
});

describe("the demo set is unchanged", () => {
  it("still pays the routine invoice with triage clear", async () => {
    deps.triage = new FakeTriage(routineTriage());
    app = createApp(deps);
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../scripts/demo-invoices/01-routine-invoice.ja.txt", import.meta.url), "utf8");
    expect((await post("/invoices/analyze", { text })).verdict.decision).toBe("pay");
  });
});
