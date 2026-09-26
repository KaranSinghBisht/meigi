import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { canonical, createAuditLog, GENESIS, sha256, type AuditLog } from "../src/audit/log.js";
import type { AppDeps } from "../src/deps.js";
import { demo, fakeDeps } from "./fakes.js";
import { approvalHarness, approvedWith, DEVICE_CODE, pending } from "./mock-idp.js";

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meigi-audit-"));
  file = join(dir, "audit.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fill = (log: AuditLog, n: number) => {
  for (let i = 1; i <= n; i++) log.record("payment", { analysisId: `a${i}`, amount: `¥${i * 1000}` });
};
const lines = () => readFileSync(file, "utf8").split("\n").filter(Boolean);
const rewrite = (next: string[]) => writeFileSync(file, `${next.join("\n")}\n`);

describe("the audit log's hash chain", () => {
  it("links every entry to the previous one, and survives a restart", () => {
    fill(createAuditLog(file), 3);
    const restarted = createAuditLog(file); // a new process on the same file
    restarted.record("payment", { analysisId: "a4" });
    const entries = restarted.recent(10).reverse();
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(entries[0]!.prev).toBe(GENESIS);
    for (let i = 1; i < entries.length; i++) expect(entries[i]!.prev).toBe(entries[i - 1]!.hash);
    expect(restarted.verify()).toEqual({ ok: true, entries: 4 });
  });

  it("breaks where a past entry is edited, dropped or reordered", () => {
    const log = createAuditLog(file);
    fill(log, 5);
    const original = lines();

    rewrite(original.map((line, i) => (i === 2 ? line.replace("¥3000", "¥300000") : line))); // edit entry 3
    expect(log.verify()).toEqual({ ok: false, entries: 5, brokenAt: 3, reason: "its contents don't match its hash" });

    rewrite(original.filter((_, i) => i !== 1)); // drop entry 2
    expect(log.verify()).toMatchObject({ ok: false, brokenAt: 2, reason: "expected entry 2, found 3" });

    rewrite([original[0]!, original[2]!, original[1]!, ...original.slice(3)]); // swap entries 2 and 3
    expect(log.verify()).toMatchObject({ ok: false, brokenAt: 2 });

    // Re-hashing an edited entry doesn't help: the next entry still names the old hash.
    const { hash: _old, ...body } = JSON.parse(original[2]!) as Record<string, unknown>;
    const edited = { ...body, amount: "¥300000" };
    rewrite([original[0]!, original[1]!, JSON.stringify({ ...edited, hash: sha256(canonical(edited)) }), ...original.slice(3)]);
    expect(log.verify()).toEqual({ ok: false, entries: 5, brokenAt: 4, reason: "it doesn't name the previous entry's hash" });

    rewrite(original);
    expect(log.verify()).toEqual({ ok: true, entries: 5 });
  });

  it("rejects a line that isn't JSON", () => {
    const log = createAuditLog(file);
    fill(log, 2);
    rewrite([lines()[0]!, "not json", lines()[1]!]);
    expect(log.verify()).toMatchObject({ ok: false, brokenAt: 2, reason: "the line is not JSON" });
  });
});

describe("what the agent records", () => {
  const request = async (deps: AppDeps, method: string, path: string, body?: unknown) => {
    const init: RequestInit = { method, headers: { "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await createApp(deps).request(path, init);
    return (await res.json()) as Record<string, any>;
  };

  it("a verdict, then the payment it led to, never the document itself; GET /audit verifies the chain", async () => {
    const deps = { ...fakeDeps(), audit: createAuditLog(file) };
    const analysis = await request(deps, "POST", "/invoices/analyze", { text: demo("01-routine-invoice.ja.txt") });
    await request(deps, "POST", `/invoices/${analysis.id}/pay`, {});
    await request(deps, "POST", `/invoices/${analysis.id}/pay`, {}); // already paid: nothing new to record

    const audit = await request(deps, "GET", "/audit?verify=1");
    expect(audit.chain).toEqual({ ok: true, entries: 3 });
    const [paid, sent, decided] = audit.entries;
    expect(decided).toMatchObject({ event: "analysis", analysisId: analysis.id, decision: "pay", tNumber: "T2011001234567", amount: "¥132,000", reasons: [] });
    expect(decided.documentSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(sent).toMatchObject({ event: "payment", mode: "auto", status: "pending", txHash: "0xfeed1" });
    expect(paid).toMatchObject({ event: "payment", mode: "auto", status: "paid", txHash: "0xfeed1", blockNumber: "101", amount: "¥132,000" });
    expect(readFileSync(file, "utf8")).not.toContain("クラウド会計システム保守"); // the document's text stays out
  });

  it("a hold, the human's approval and the payment it released", async () => {
    const log = createAuditLog(file);
    const h = await approvalHarness({ record: (event, fields) => log.record(event, fields) });
    const deps = { ...fakeDeps(), approvals: h.approvals, audit: log };
    const analysis = await request(deps, "POST", "/invoices/analyze", { text: demo("07-urgent-invoice.ja.txt") });
    h.idp.token = [pending, approvedWith(await h.idp.sign({ auth_time: h.idp.clock.now + 7 }))];
    const started = await request(deps, "POST", `/invoices/${analysis.id}/approval`, {});
    await h.approvals.settled(started.attemptId);
    await request(deps, "POST", `/invoices/${analysis.id}/pay`, { approvalId: started.attemptId });

    const entries = log.recent(10).reverse();
    expect(entries.map((e) => [e.event, e.status ?? e.decision])).toEqual([
      ["analysis", "hold"],
      ["approval.started", undefined],
      ["approval.settled", "approved"],
      ["payment", "pending"],
      ["payment", "paid"],
    ]);
    expect(entries[0]).toMatchObject({ reasons: [{ code: "pressure_hold", layer: "triage" }], approvable: true });
    expect(entries[1]).toMatchObject({ approvalId: started.attemptId, analysisId: analysis.id });
    expect(entries[2]).toMatchObject({ approvedAt: 1_790_000_007, approver: "enrolled" });
    expect(entries[2]!.approverId).toMatch(/^[0-9a-f]{16}$/u);
    expect(entries[4]).toMatchObject({ mode: "approved", approvalId: started.attemptId, amount: "¥55,000" });
    expect(log.verify()).toEqual({ ok: true, entries: 5 });
    expect(readFileSync(file, "utf8")).not.toContain(DEVICE_CODE);
  });
});
