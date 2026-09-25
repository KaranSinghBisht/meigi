import { agentVaultAbi, mockJPYCAbi } from "@meigi/abi";
import { encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { describeRevert } from "../src/chain/describe.js";
import { decodeRaw } from "../src/chain/revert.js";
import { LOOKALIKE, MEIGI_PAYOUT, SCAMMER, T_MEIGI, VAULT, yen } from "./fakes.js";

const ctx = {
  decimals: 18,
  nameOf: async (t: bigint) => (t === T_MEIGI ? "株式会社メイギ商事" : null),
};

const vaultError = (errorName: string, args: readonly unknown[]) =>
  decodeRaw(encodeErrorResult({ abi: agentVaultAbi, errorName, args } as Parameters<typeof encodeErrorResult>[0]));

describe("revert decoding", () => {
  it("turns PayeeMismatch into the sentence the demo shows", async () => {
    const raw = vaultError("PayeeMismatch", [T_MEIGI, SCAMMER, MEIGI_PAYOUT]);
    expect(await describeRevert(raw, ctx)).toEqual({
      name: "PayeeMismatch",
      args: { tNumber: "2011001234567", expected: SCAMMER, registered: MEIGI_PAYOUT },
      sentence: "T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b.",
    });
  });

  it("keeps lookalike addresses tell-apart in the sentence", async () => {
    const raw = vaultError("PayeeMismatch", [T_MEIGI, LOOKALIKE, MEIGI_PAYOUT]);
    expect((await describeRevert(raw, ctx)).sentence).toBe(
      "T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0x9b4f…56e4.",
    );
  });

  it("formats caps and balances in yen", async () => {
    const over = await describeRevert(vaultError("OverPaymentCap", [T_MEIGI, yen(4_800_000), yen(500_000)]), ctx);
    expect(over.sentence).toBe("¥4,800,000 is over the ¥500,000 per-payment cap for T2011001234567 = 株式会社メイギ商事.");
    const unapproved = await describeRevert(vaultError("VendorNotApproved", [3999905000001n]), ctx);
    expect(unapproved.sentence).toMatch(/^T3999905000001 is not on this vault's approved vendor list/u);
  });

  it("decodes token errors that SafeERC20 bubbles up through the vault", async () => {
    const data = encodeErrorResult({ abi: mockJPYCAbi, errorName: "ERC20InsufficientBalance", args: [VAULT, yen(1_000), yen(132_000)] });
    const decoded = await describeRevert(decodeRaw(data), ctx);
    expect(decoded).toMatchObject({ name: "ERC20InsufficientBalance", args: { sender: VAULT } });
    expect(decoded.sentence).toBe("The vault holds ¥1,000, but this payment needs ¥132,000.");
  });

  it("reports unknown selectors instead of guessing", async () => {
    const decoded = await describeRevert(decodeRaw("0xdeadbeef"), ctx);
    expect(decoded).toMatchObject({ name: "UnknownRevert", args: { data: "0xdeadbeef" } });
  });

  it("still describes the revert when the registry name lookup fails", async () => {
    const failing = { decimals: 18, nameOf: async () => Promise.reject(new Error("rpc down")) };
    const decoded = await describeRevert(vaultError("InvoiceAlreadyPaid", [T_MEIGI, `0x${"11".repeat(32)}`, yen(132_000)]), failing);
    expect(decoded.sentence).toBe("This invoice was already paid (¥132,000 to T2011001234567); a second payment is refused.");
  });
});
