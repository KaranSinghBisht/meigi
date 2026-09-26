import { describe, expect, it } from "vitest";
import { sybilScoreOf } from "../src/world/session.js";

const selfieCheck = (score: number) => ({
  session_id: "session_x",
  responses: [{ identifier: "selfie", sybil_score: score }],
});
const otherCredential = (identifier: string) => ({
  session_id: "session_x",
  responses: [{ identifier }],
});

describe("sybilScoreOf", () => {
  it("reads Self Check's z-score", () => {
    expect(sybilScoreOf(selfieCheck(0))).toBe(0);
    expect(sybilScoreOf(selfieCheck(42))).toBe(42);
  });

  it("is undefined for any other credential, which carries no such field", () => {
    expect(sybilScoreOf(otherCredential("proof_of_human"))).toBeUndefined();
    expect(sybilScoreOf(otherCredential("passport"))).toBeUndefined();
    expect(sybilScoreOf(otherCredential("mnc"))).toBeUndefined();
  });

  it("is undefined for malformed or missing responses", () => {
    expect(sybilScoreOf({ responses: [] })).toBeUndefined();
    expect(sybilScoreOf({})).toBeUndefined();
    expect(sybilScoreOf({ session_id: "session_x", responses: [{ identifier: "selfie", sybil_score: "42" }] })).toBeUndefined();
  });
});
