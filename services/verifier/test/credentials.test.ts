import { describe, expect, it } from "vitest";
import { requireCredential, WorldVerificationError } from "../src/world/session.js";

// The real issuer_schema_id for each accepted credential (from IDKit's own response types); attached by default
// so every existing call below stays a realistic, correctly-paired proof unless a test deliberately overrides it.
const SCHEMA_ID: Record<string, number> = { proof_of_human: 1, selfie: 11 };
const result = (...identifiers: unknown[]) => ({
  session_id: "session_x",
  responses: identifiers.map((identifier) => ({
    identifier,
    ...(typeof identifier === "string" && identifier in SCHEMA_ID ? { issuer_schema_id: SCHEMA_ID[identifier] } : {}),
  })),
});
const ORB_ONLY = new Set(["proof_of_human"]);
const ORB_OR_SELFIE = new Set(["proof_of_human", "selfie"]);

function codeOf(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof WorldVerificationError ? error.code : "other";
  }
}

describe("requireCredential", () => {
  it("accepts only the credentials this deployment chose for officers", () => {
    expect(codeOf(() => requireCredential(result("proof_of_human"), ORB_ONLY))).toBeNull();
    expect(codeOf(() => requireCredential(result("selfie"), ORB_ONLY))).toBe("credential_not_allowed");
    expect(codeOf(() => requireCredential(result("selfie"), ORB_OR_SELFIE))).toBeNull();
    expect(codeOf(() => requireCredential(result("passport"), ORB_OR_SELFIE))).toBe("credential_not_allowed");
  });

  it("accepts a mocked Orb (proof_of_human) response when the deployment allows either", () => {
    // The live production config as of Karan's run: WORLD_OFFICER_CREDENTIALS=selfie,proof_of_human - Selfie
    // Check is the minimum, but an officer who happens to be Orb-verified is accepted too.
    expect(codeOf(() => requireCredential(result("proof_of_human"), ORB_OR_SELFIE))).toBeNull();
  });

  it("refuses proofs with no responses, a missing identifier, or any disallowed credential", () => {
    expect(codeOf(() => requireCredential({ responses: [] }, ORB_OR_SELFIE))).toBe("credential_not_allowed");
    expect(codeOf(() => requireCredential({}, ORB_OR_SELFIE))).toBe("credential_not_allowed");
    expect(codeOf(() => requireCredential(result(undefined), ORB_OR_SELFIE))).toBe("credential_not_allowed");
    expect(codeOf(() => requireCredential(result("proof_of_human", "passport"), ORB_OR_SELFIE))).toBe("credential_not_allowed");
  });

  it("pins issuer_schema_id alongside the label: a mismatched or missing schema id is refused even when the " +
    "identifier alone is allowed", () => {
    const wrongSchema = (identifier: string, issuer_schema_id: number) => ({
      session_id: "session_x",
      responses: [{ identifier, issuer_schema_id }],
    });
    // Correct pairing still passes (regression guard for the mapping itself).
    expect(codeOf(() => requireCredential(result("proof_of_human"), ORB_ONLY))).toBeNull();
    expect(codeOf(() => requireCredential(result("selfie"), ORB_OR_SELFIE))).toBeNull();
    // A label that doesn't match its own claimed schema id.
    expect(codeOf(() => requireCredential(wrongSchema("proof_of_human", 11), ORB_ONLY))).toBe("credential_not_allowed");
    // Selfie's schema id smuggled in under the proof_of_human label - the case this pin exists for.
    expect(codeOf(() => requireCredential(wrongSchema("proof_of_human", 11), ORB_OR_SELFIE))).toBe("credential_not_allowed");
    // A schema id for a credential this deployment never accepts at all (passport = 9303).
    expect(codeOf(() => requireCredential(wrongSchema("proof_of_human", 9303), ORB_ONLY))).toBe("credential_not_allowed");
    // Allowed identifier, no issuer_schema_id at all.
    expect(codeOf(() => requireCredential({ session_id: "session_x", responses: [{ identifier: "proof_of_human" }] }, ORB_ONLY))).toBe(
      "credential_not_allowed",
    );
  });
});
