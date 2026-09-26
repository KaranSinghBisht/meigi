import { describe, expect, it } from "vitest";
import { requireCredential, WorldVerificationError } from "../src/world/session.js";

const result = (...identifiers: unknown[]) => ({ session_id: "session_x", responses: identifiers.map((identifier) => ({ identifier })) });
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
});
