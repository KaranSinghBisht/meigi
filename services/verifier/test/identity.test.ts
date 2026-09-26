import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { checkRegisteredName, nameKey, type Corporation, type CorporationIndex } from "../src/nta/corporations.js";
import { domainProofMessage, normalizeDomain, TXT_PREFIX, verifyDomainProof } from "../src/domain/proof.js";
import { hasCorporateCheckDigit, parseTNumber } from "../src/tnumber.js";

describe("T-numbers", () => {
  it("parse the usual spellings", () => {
    expect(parseTNumber("T1010601051968")).toBe("1010601051968");
    expect(parseTNumber(" t1010601051968 ")).toBe("1010601051968");
    expect(parseTNumber("1010601051968")).toBe("1010601051968");
    expect(parseTNumber("T101060105196")).toBeNull();
  });

  it("validate the 法人番号 check digit", () => {
    expect(hasCorporateCheckDigit("7000012050002")).toBe(true); // National Tax Agency
    expect(hasCorporateCheckDigit("1010601051968")).toBe(true); // Curvegrid Inc.
    expect(hasCorporateCheckDigit("2011001234567")).toBe(true);
    expect(hasCorporateCheckDigit("4011001234567")).toBe(false);
  });
});

const curvegrid: Corporation = {
  number: "1010601051968",
  name: "Ｃｕｒｖｅｇｒｉｄ株式会社",
  kind: "301",
  pref: "東京都",
  city: "渋谷区",
  street: "",
  postCode: "",
  closeDate: "",
  enName: "Curvegrid Inc.",
  furigana: "",
};
const index: CorporationIndex = { byNumber: (d) => (d === curvegrid.number ? curvegrid : null), byNameKey: () => [] };

describe("NTA exact match", () => {
  it("only normalises width and whitespace", () => {
    expect(nameKey("Ｃｕｒｖｅｇｒｉｄ 株式会社")).toBe("Curvegrid株式会社");
    expect(checkRegisteredName(index, "1010601051968", "Curvegrid株式会社")).toMatchObject({ ok: true });
  });

  it("never accepts a fuzzy match", () => {
    expect(checkRegisteredName(index, "1010601051968", "株式会社Curvegrid")).toMatchObject({
      ok: false,
      reason: "name_mismatch",
    });
    expect(checkRegisteredName(index, "2011001234567", "anything")).toMatchObject({ reason: "not_found" });
  });
});

describe("domain proof", () => {
  const controller = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const input = { domain: "example.co.jp", tNumber: "T1010601051968", nonce: "abc123", controller: controller.address };
  const noFetch = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;

  it("rejects hosts that aren't public domain names", () => {
    expect(normalizeDomain("Example.CO.JP.")).toBe("example.co.jp");
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("127.0.0.1")).toBeNull();
    expect(normalizeDomain("evil.com/path")).toBeNull();
  });

  it("accepts a TXT record signed by the controller", async () => {
    const signature = await controller.signMessage({
      message: domainProofMessage(input.domain, input.tNumber, input.nonce),
    });
    const resolveTxt = async () => [["v=spf1 -all"], [`${TXT_PREFIX}${signature}`]];
    await expect(verifyDomainProof(input, { resolveTxt, fetch: noFetch })).resolves.toEqual({ ok: true, method: "dns" });
  });

  it("rejects a record signed by someone else", async () => {
    const other = privateKeyToAccount(`0x${"33".repeat(32)}`);
    const signature = await other.signMessage({ message: domainProofMessage(input.domain, input.tNumber, input.nonce) });
    const resolveTxt = async () => [[`${TXT_PREFIX}${signature}`]];
    await expect(verifyDomainProof(input, { resolveTxt, fetch: noFetch })).resolves.toEqual({
      ok: false,
      reason: "signature_mismatch",
    });
  });

  it("reports a missing proof", async () => {
    const resolveTxt = async () => {
      throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    };
    await expect(verifyDomainProof(input, { resolveTxt, fetch: noFetch })).resolves.toEqual({
      ok: false,
      reason: "no_proof_found",
    });
  });
});
