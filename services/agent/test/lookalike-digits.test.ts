import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analysis/analyze.js";
import { payAnalysis } from "../src/analysis/pay.js";
import { approvalRefusal } from "../src/approval/holds.js";
import { extractInvoice } from "../src/extract/extract.js";
import { fakeDeps, MEIGI_PAYOUT } from "./fakes.js";

/** NFKC folds ¹ ① ₁ into ASCII digits, which then joined the amount: ¥13,200¹ read as ¥132,001 (review H1). */

const invoice = (amountLine: string) =>
  `請求書\n請求書番号: MS-2026-1101\n株式会社メイギ商事\n登録番号: T2011001234567\n${amountLine}\n受取アドレス: ${MEIGI_PAYOUT}\n`;
const blocks = (text: string) => extractInvoice(text).flags.filter((f) => f.severity === "block").map((f) => f.code);

describe("look-alike digits", () => {
  it.each([
    ["a superscript", "ご請求金額 ¥13,200¹", "¹"],
    ["a circled digit", "ご請求金額 ¥13,200①", "①"],
    ["a subscript", "ご請求金額 ¥13,200₁", "₁"],
    ["a parenthesised digit", "ご請求金額 ¥13,200⑴", "⑴"],
    ["a mathematical digit", "ご請求金額 ¥13,200𝟏", "𝟏"],
  ])("never folds %s into the amount, and blocks it as tampering", (_label, line, char) => {
    const extracted = extractInvoice(invoice(line));
    expect(extracted.amount?.value).toBe("13200");
    expect(extracted.flags).toContainEqual(expect.objectContaining({ code: "lookalike_digits", severity: "block", evidence: char }));
  });

  it("still reads full-width digits, which are ordinary Japanese typing", () => {
    const extracted = extractInvoice(invoice("ご請求金額　￥１３２，０００（税込）"));
    expect(extracted.amount?.value).toBe("132000");
    expect(blocks(invoice("ご請求金額　￥１３２，０００（税込）"))).toEqual([]);
  });

  it("holds the reviewer's case, which used to pay ¥132,001, and nobody can release it", async () => {
    const deps = fakeDeps();
    const stored = await analyzeDocument(deps, invoice("合計 ¥13,200¹（うち消費税 ¥1,200）"));
    expect(stored.verdict.decision).toBe("hold");
    expect(stored.view.kernel.intent?.amount.display).toBe("¥13,200");
    expect(approvalRefusal(stored)).toMatch(/lookalike_digits/u);
    expect(await payAnalysis(deps, stored, "auto", () => {})).toMatchObject({ status: "held" });
    expect(await payAnalysis(deps, stored, "force", () => {})).toMatchObject({ status: "held", reasons: [{ code: "force_refused" }] });
    expect(deps.payer.sent).toEqual([]);
  });
});
