import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { invoiceKey } from "../src/analysis/duplicates.js";
import { invoiceRefOf } from "../src/kernel/intent.js";
import { fakeDeps, MEIGI_PAYOUT } from "./fakes.js";

/** Review L3: MS/2026/0917 and MS20260917 get their own invoiceRef; a person decides if they're the same bill. */

const invoice = (no: string, amount = "¥132,000") =>
  `請求書\n請求書番号: ${no}\n株式会社メイギ商事\n登録番号: T2011001234567\nご請求金額 ${amount}\n受取アドレス: ${MEIGI_PAYOUT}\n`;

async function paidOnce() {
  const deps = fakeDeps();
  const app = createApp(deps);
  const post = async (path: string, body: unknown) =>
    (await (await app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } })).json()) as Record<string, any>;
  const first = await post("/invoices/analyze", { text: invoice("MS-2026-0917") });
  expect(first.verdict.decision).toBe("pay");
  expect((await post(`/invoices/${first.id}/pay`, {})).status).toBe("paid");
  return { deps, post };
}

describe("possible duplicates", () => {
  it.each(["MS/2026/0917", "MS20260917"])("holds %s after MS-2026-0917 was paid, for a person to release", async (no) => {
    const { post } = await paidOnce();
    const again = await post("/invoices/analyze", { text: invoice(no) });
    expect(again.verdict.decision).toBe("hold");
    expect(again.verdict.reasons).toEqual([
      expect.objectContaining({ code: "possible_duplicate", severity: "block", evidence: "already paid: MS-2026-0917", tNumber: "T2011001234567" }),
    ]);
    expect(again.approval).toMatchObject({ approvable: true });
  });

  it("never changes the invoiceRef the vault de-duplicates on", async () => {
    const { post } = await paidOnce();
    const again = await post("/invoices/analyze", { text: invoice("MS/2026/0917") });
    expect(again.kernel.intent.invoiceRef).toBe(invoiceRefOf("2011001234567", "MS/2026/0917"));
    expect(again.kernel.intent.invoiceRef).not.toBe(invoiceRefOf("2011001234567", "MS-2026-0917"));
  });

  it("doesn't hold a different amount, or the same number (the vault refuses that one itself)", async () => {
    const { post } = await paidOnce();
    for (const text of [invoice("MS/2026/0917", "¥132,500"), invoice("MS-2026-0917")]) {
      const codes = ((await post("/invoices/analyze", { text })).verdict.reasons as { code: string }[]).map((r) => r.code);
      expect(codes).not.toContain("possible_duplicate");
    }
  });

  it("keys numbers without separators", () => {
    expect(["MS-2026-0917", "MS/2026/0917", "ms 2026 0917", "ＭＳ－２０２６－０９１７"].map(invoiceKey)).toEqual(Array(4).fill("MS20260917"));
  });
});
