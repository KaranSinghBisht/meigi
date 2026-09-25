import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApproverRegistry } from "../src/approval/approvers.js";
import type { StoredAnalysis } from "../src/analysis/store.js";
import { analyzeDocument } from "../src/analysis/analyze.js";
import { demo, fakeDeps } from "./fakes.js";
import { approvalHarness, approvedWith } from "./mock-idp.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), "meigi-approvers-"));
  dirs.push(dir);
  return join(dir, "agent", "approvers.json");
};

async function heldInvoice(): Promise<StoredAnalysis> {
  return analyzeDocument(fakeDeps(), demo("07-urgent-invoice.ja.txt"));
}

describe("approvers", () => {
  it("never enrolls anyone unless WORLD_AGENTS_ENROLL is on: whoever scans first is wrong_human (M2)", () => {
    const path = tempFile();
    const registry = createApproverRegistry({ allowed: [], path, enroll: false });
    expect(registry.check("attacker-sub")).toBe("wrong_human");
    expect(registry.check("operator-sub")).toBe("wrong_human");
    expect(existsSync(path)).toBe(false);
  });

  it("enrolls exactly one approver during an enrolment run, persisted with mode 600", () => {
    const path = tempFile();
    const run = createApproverRegistry({ allowed: [], path, enroll: true });
    expect(run.check("operator-sub")).toBe("enrolled");
    expect(run.check("someone-else")).toBe("wrong_human"); // the window closes after the first enrolment
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ version: 1, subs: ["operator-sub"] });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const restarted = createApproverRegistry({ allowed: [], path, enroll: false });
    expect(restarted.check("operator-sub")).toBe("matched");
    expect(restarted.check("someone-else")).toBe("wrong_human");
  });

  it("doesn't reopen enrolment when the file goes missing, unless enrolment is on", () => {
    const path = tempFile();
    createApproverRegistry({ allowed: [], path, enroll: true }).check("operator-sub");
    rmSync(path);
    expect(createApproverRegistry({ allowed: [], path, enroll: false }).check("someone-else")).toBe("wrong_human");
  });

  it("fails closed on a corrupt or unreadable file, even with enrolment on", () => {
    const path = tempFile();
    createApproverRegistry({ allowed: [], path, enroll: true }).check("operator-sub");
    writeFileSync(path, "{corrupt");
    expect(createApproverRegistry({ allowed: [], path, enroll: true }).check("someone-else")).toBe("wrong_human");
    writeFileSync(path, JSON.stringify({ version: 1, subs: ["operator-sub"] }));
    chmodSync(path, 0o000);
    try {
      expect(createApproverRegistry({ allowed: [], path, enroll: true }).check("operator-sub")).toBe("wrong_human");
    } finally {
      chmodSync(path, 0o600);
    }
  });

  it("matches the allow-list exactly, alongside the enrolled approver", () => {
    const registry = createApproverRegistry({ allowed: ["abc"], path: null, enroll: false });
    expect(["abc", "ABC", "abc ", "ab"].map((sub) => registry.check(sub))).toEqual(["matched", "wrong_human", "wrong_human", "wrong_human"]);
  });

  it("refuses an unknown human end to end, and matches the configured one", async () => {
    const h = await approvalHarness({ allowed: ["human-9"], enroll: false });
    h.idp.token = [approvedWith(await h.idp.sign({ sub: "human-1" }))];
    const stored = await heldInvoice();
    const started = await h.approvals.start(stored);
    await h.approvals.settled(started.attemptId);
    expect(h.approvals.status(stored.view.id)).toMatchObject({ status: "wrong_human", reason: "a different person proved than the approver on file" });
    const again = await approvalHarness({ allowed: ["human-9"], enroll: false });
    again.idp.token = [approvedWith(await again.idp.sign({ sub: "human-9" }))];
    const second = await heldInvoice();
    await again.approvals.settled((await again.approvals.start(second)).attemptId);
    expect(again.approvals.status(second.view.id)).toMatchObject({ status: "approved", approver: "matched" });
  });
});
