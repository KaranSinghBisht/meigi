import { describe, expect, it } from "vitest";
import { extractInvoice } from "../src/extract/extract.js";
import { MEIGI_PAYOUT } from "./fakes.js";

/** How printed yen amounts are read: review findings L1 (dash minus signs) and L2 (decimal yen). */

const invoice = (amountLine: string) =>
  `請求書\n請求書番号: MS-2026-1101\n株式会社メイギ商事\n登録番号: T2011001234567\n${amountLine}\n受取アドレス: ${MEIGI_PAYOUT}\n`;

describe("dash-like minus signs (review L1)", () => {
  it.each(["-", "‐", "‑", "‒", "–", "—", "﹣", "−"])("reads %s touching the amount as a negative, so it holds as a credit note", (dash) => {
    const extracted = extractInvoice(invoice(`ご請求金額 ${dash}¥22,000`));
    expect(extracted.amount?.value).toBe("-22000");
    expect(extracted.flags.map((f) => f.code)).toContain("credit_note");
  });

  it("still treats a free-standing dash as a separator", () => {
    expect(extractInvoice(invoice("保守費用 – ¥22,000")).amount?.value).toBe("22000");
  });
});
