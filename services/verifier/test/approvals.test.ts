import { pad, recoverTypedDataAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  addressTarget,
  approvalDigest,
  approvalTypedData,
  signApproval,
  sortOfficerIds,
  type ApprovalRequest,
} from "../src/registry/approvals.js";

const OFFICER_A = pad("0xa1", { size: 32 });
const OFFICER_B = pad("0xb2", { size: 32 });

// Same inputs as contracts/test/registry/ApprovalDigestVector.t.sol.
const vector: ApprovalRequest = {
  chainId: 11155111,
  registry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  tNumber: 2011001234567n,
  action: "PayoutChange",
  target: addressTarget("0x000000000000000000000000000000000000bEEF"),
  officerIds: [OFFICER_A, OFFICER_B],
  nonce: 0n,
  deadline: 1_790_000_000n,
};

describe("officer approvals", () => {
  it("hash exactly like the Solidity registry", () => {
    expect(approvalDigest(vector)).toBe("0xe49b7b2644639abe74faa9cdf0723a96d06b4d1b31ac7638cd572a0e86391586");
  });

  it("sign with the attester key and sort officer ids", async () => {
    const attester = privateKeyToAccount(`0x${"11".repeat(32)}` as Hex);
    const signed = await signApproval(attester, { ...vector, officerIds: [OFFICER_B, OFFICER_A] });
    expect(signed.officerIds).toEqual([OFFICER_A, OFFICER_B]);
    const recovered = await recoverTypedDataAddress({ ...approvalTypedData(vector), signature: signed.signature });
    expect(recovered).toBe(attester.address);
  });

  it("reject duplicate officer ids", () => {
    expect(() => sortOfficerIds([OFFICER_A, OFFICER_A])).toThrow("duplicate officer id");
  });
});
