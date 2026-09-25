import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRIAGE_QUESTIONS } from "../src/triage/questions.js";

// The fine-tuned Kev binds the exact question strings; PayeeBench's dataset records carry them verbatim.
const DATASET = fileURLToPath(new URL("../../../bench/dataset/val.jsonl", import.meta.url));

describe.skipIf(!existsSync(DATASET))("System-1 questions", () => {
  it("match PayeeBench's production strings byte for byte", () => {
    const first = JSON.parse(readFileSync(DATASET, "utf8").split("\n")[0]!) as { questions: Record<string, Record<string, unknown>> };
    const bench = Object.fromEntries(Object.entries(first.questions).map(([id, { label: _label, ...question }]) => [id, question]));
    expect(TRIAGE_QUESTIONS).toEqual(bench);
  });
});
