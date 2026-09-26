import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { demo, FakeLlm, FakeTriage, fakeDeps, routineTriage, type Fakes } from "./fakes.js";
import { approvalHarness, approvedWith, denied, DEVICE_CODE, expired, pending } from "./mock-idp.js";

/** The HTTP flow the console drives: analyze, ask a verified human, pay with the approval. */
async function setup(opts: Parameters<typeof approvalHarness>[0] = {}) {
  const h = await approvalHarness(opts);
  const deps = { ...fakeDeps(), approvals: h.approvals };
  const app = createApp(deps);
  const call = async (method: string, path: string, body?: unknown) => {
    const init: RequestInit = { method, headers: { "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await app.request(path, init);
    const text = await res.text();
    expect(text).not.toContain(DEVICE_CODE);
    return { status: res.status, body: JSON.parse(text) as Record<string, any> };
  };
  const analyze = async (file: string) => (await call("POST", "/invoices/analyze", { text: demo(file) })).body;
  return { h, deps, call, analyze };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Asks for approval, lets the mock IdP answer, and returns the attempt id and final state. */
async function ask(s: Setup, id: string) {
  const started = await s.call("POST", `/invoices/${id}/approval`, {});
  expect(started.status).toBe(202);
  await s.h.approvals.settled(started.body.attemptId);
  const state = await s.call("GET", `/invoices/${id}/approval`);
  return { attemptId: started.body.attemptId as string, state: state.body };
}

const nothingPaid = (deps: AppDeps & Fakes) => {
  expect(deps.payer.simulated).toHaveLength(0);
  expect(deps.payer.sent).toHaveLength(0);
};

describe("human approval over HTTP", () => {
  it("holds an urgent but genuine invoice for a person, and pays once a verified human approves", async () => {
    const s = await setup();
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    expect(analysis.verdict.decision).toBe("hold");
    expect(analysis.verdict.reasons.map((r: { code: string }) => r.code)).toEqual(["pressure_hold"]);
    expect(analysis.approval).toEqual({ enabled: true, approvable: true });
    expect((await s.call("POST", `/invoices/${analysis.id}/pay`, {})).body.status).toBe("held");

    s.h.idp.token = [pending, approvedWith(await s.h.idp.sign({ auth_time: s.h.idp.clock.now + 7 }))];
    const { attemptId, state } = await ask(s, analysis.id);
    expect(state).toEqual({ attemptId, status: "approved", expiresAt: 1_790_001_200, used: false, approvedAt: 1_790_000_007, approver: "enrolled" });

    const paid = await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId });
    expect(paid.body).toMatchObject({ status: "paid", forced: false, amount: "¥55,000" });
    expect(s.deps.payer.sent).toHaveLength(1);
    expect(s.deps.payer.sent[0]).toMatchObject({ tNumber: 2011001234567n, amount: 55_000n * 10n ** 18n });
    expect((await s.call("GET", `/invoices/${analysis.id}/approval`)).body).toMatchObject({ status: "approved", used: true });
    expect((await s.call("GET", `/invoices/${analysis.id}`)).body.approval).toEqual({ enabled: true, approvable: false });
  });

  it.each([
    ["denied in the World ID app", denied, "denied"],
    ["expired", expired, "expired"],
  ])("pays nothing when the request is %s", async (_label, reply, status) => {
    const s = await setup();
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    s.h.idp.token = [pending, reply];
    const { attemptId, state } = await ask(s, analysis.id);
    expect(state.status).toBe(status);
    const pay = await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId });
    expect(pay).toEqual({ status: 409, body: { code: "approval_not_approved", message: `the approval is ${status}: nothing was paid` } });
    nothingPaid(s.deps);
  });

  it("pays nothing when a different human proves", async () => {
    const s = await setup({ allowed: ["human-approver"] });
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    s.h.idp.token = [approvedWith(await s.h.idp.sign({ sub: "human-intruder" }))];
    const { attemptId, state } = await ask(s, analysis.id);
    expect(state.status).toBe("wrong_human");
    expect((await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId })).status).toBe(409);
    nothingPaid(s.deps);
  });

  it("pays nothing on an invalid token (wrong audience)", async () => {
    const s = await setup();
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    s.h.idp.token = [approvedWith(await s.h.idp.sign({ aud: "app_other" }))];
    const { attemptId, state } = await ask(s, analysis.id);
    expect(state).toMatchObject({ status: "denied", reason: "invalid token: the ID token's aud claim is wrong" });
    expect((await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId })).status).toBe(409);
    nothingPaid(s.deps);
  });

  it("spends an approval once, even when the chain refused the first payment", async () => {
    const s = await setup();
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    s.h.idp.token = [approvedWith(await s.h.idp.sign())];
    const { attemptId } = await ask(s, analysis.id);
    s.deps.payer.revert = { name: "OverPeriodCap", inputs: [], args: [] };
    const first = await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId });
    expect(first.body).toMatchObject({ status: "reverted", broadcast: false });
    const again = await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId });
    expect(again).toEqual({ status: 409, body: { code: "approval_used", message: "this approval was already used" } });
    expect(s.deps.payer.sent).toHaveLength(0);
  });

  it("refuses a second pay with the same approval after it paid", async () => {
    const s = await setup();
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    s.h.idp.token = [approvedWith(await s.h.idp.sign())];
    const { attemptId } = await ask(s, analysis.id);
    expect((await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId })).body.status).toBe("paid");
    expect((await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId })).body.code).toBe("approval_used");
    expect(s.deps.payer.sent).toHaveLength(1);
  });

  it("voids the approval when the analysis changed after approval", async () => {
    const s = await setup();
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    s.h.idp.token = [approvedWith(await s.h.idp.sign())];
    const { attemptId } = await ask(s, analysis.id);
    const stored = s.deps.store.get(analysis.id)!;
    s.deps.store.save({ ...stored, intent: { ...stored.intent!, amount: stored.intent!.amount * 10n } });
    const pay = await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: attemptId });
    expect(pay).toEqual({ status: 409, body: { code: "approval_void", message: "the invoice changed after it was approved: nothing was paid" } });
    nothingPaid(s.deps);
  });

  it("won't use one invoice's approval on another", async () => {
    const s = await setup();
    const first = await s.analyze("07-urgent-invoice.ja.txt");
    const second = await s.analyze("07-urgent-invoice.ja.txt");
    s.h.idp.token = [approvedWith(await s.h.idp.sign())];
    const { attemptId } = await ask(s, first.id);
    expect((await s.call("POST", `/invoices/${second.id}/pay`, { approvalId: attemptId })).body.code).toBe("approval_not_found");
    nothingPaid(s.deps);
  });

  it.each([
    ["a credit note", "05-credit-note.ja.txt", /credit_note/u],
    ["a swapped payout (BEC)", "02-bank-change-bec.ja.txt", /payout_mismatch/u],
    ["hidden payment details", "04-prompt-injection.ja.txt", /hidden_payment_details/u],
    ["an invoice that would pay anyway", "01-routine-invoice.ja.txt", /isn't held/u],
  ])("answers 409 for %s: a person can't approve it", async (_label, file, message) => {
    const s = await setup();
    const analysis = await s.analyze(file);
    expect(analysis.approval).toEqual({ enabled: true, approvable: false });
    const res = await s.call("POST", `/invoices/${analysis.id}/approval`, {});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("not_approvable");
    expect(res.body.message).toMatch(message);
    expect(s.h.idp.requests).toHaveLength(0);
  });

  it("rejects force and approvalId together, and a malformed approvalId", async () => {
    const s = await setup();
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    const both = await s.call("POST", `/invoices/${analysis.id}/pay`, { force: true, approvalId: crypto.randomUUID() });
    expect(both.status).toBe(400);
    expect((await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: "../x" })).status).toBe(400);
    nothingPaid(s.deps);
  });

  it("reports 404 before any approval was requested", async () => {
    const s = await setup();
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    expect((await s.call("GET", `/invoices/${analysis.id}/approval`)).body.code).toBe("approval_not_found");
  });

  it("shows a pending attempt while the human hasn't answered", async () => {
    const s = await setup({ hold: true });
    const analysis = await s.analyze("07-urgent-invoice.ja.txt");
    const started = await s.call("POST", `/invoices/${analysis.id}/approval`, {});
    const state = await s.call("GET", `/invoices/${analysis.id}/approval`);
    expect(state.body).toEqual({ attemptId: started.body.attemptId, status: "pending", expiresAt: started.body.expiresAt, used: false });
    expect((await s.call("POST", `/invoices/${analysis.id}/pay`, { approvalId: started.body.attemptId })).body.code).toBe("approval_not_approved");
  });

  it("is off (503) without a World ID client, and /health says so", async () => {
    const deps = fakeDeps();
    const app = createApp(deps);
    const analysis = (await (await app.request("/invoices/analyze", post({ text: demo("07-urgent-invoice.ja.txt") }))).json()) as {
      id: string;
      approval: unknown;
    };
    expect(analysis.approval).toEqual({ enabled: false, approvable: true }); // the console says why the button is off
    for (const res of [
      await app.request(`/invoices/${analysis.id}/approval`, post({})),
      await app.request(`/invoices/${analysis.id}/approval`),
      await app.request(`/invoices/${analysis.id}/pay`, post({ approvalId: crypto.randomUUID() })),
    ]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ code: "approval_not_configured" });
    }
    expect(await (await app.request("/health")).json()).toMatchObject({ humanApproval: false });
    nothingPaid(deps);
  });
});

describe("judgement holds", () => {
  it("holds System-1 pressure above TRIAGE_MAX_PRESSURE even when the route auto-clears", async () => {
    const deps = fakeDeps({ triage: new FakeTriage(routineTriage({ pressure: 0.93 })) });
    const analysis = await analyzeWith(deps, "01-routine-invoice.ja.txt");
    expect(analysis.verdict.reasons).toEqual([
      expect.objectContaining({ code: "pressure_hold", layer: "triage", message: "This request pushes for a fast payment (System-1 pressure 93%)." }),
    ]);
  });

  it("never tells anyone to approve a hold nobody may release (a pressured credit note)", async () => {
    const llm = new FakeLlm({ tNumber: null, payTo: null, amount: null, invoiceNumber: null, wouldPay: false, reasoning: "" });
    const deps = fakeDeps({ triage: new FakeTriage(routineTriage({ pressure: 0.7 })) }, llm);
    const analysis = await analyzeWith(deps, "05-credit-note.ja.txt");
    expect(analysis.verdict.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: "credit_note" }), expect.objectContaining({ code: "pressure_hold" })]));
    expect(JSON.stringify(analysis.verdict.reasons)).not.toMatch(/approv/iu);
    expect(llm.explained).toHaveLength(1);
    expect(JSON.stringify(llm.explained)).not.toMatch(/approv/iu); // the explanation model is never told a person could
  });

  it("holds amounts above AUTO_CLEAR_MAX_YEN, and not below", async () => {
    const over = await analyzeWith({ ...fakeDeps(), holds: { maxPressure: 0.5, autoClearMaxYen: 100_000 } }, "01-routine-invoice.ja.txt");
    expect(over.verdict.reasons).toEqual([
      expect.objectContaining({ code: "above_auto_clear_budget", message: "¥132,000 is above the auto-clear budget of ¥100,000." }),
    ]);
    const under = await analyzeWith({ ...fakeDeps(), holds: { maxPressure: 0.5, autoClearMaxYen: 200_000 } }, "01-routine-invoice.ja.txt");
    expect(under.verdict.decision).toBe("pay");
  });
});

describe("approval in the analysis response, decided by the server", () => {
  it("reports { enabled, approvable } on analyze and GET, live", async () => {
    const s = await setup();
    const cases: [string, boolean][] = [
      ["07-urgent-invoice.ja.txt", true], // held for pressure only
      ["01-routine-invoice.ja.txt", false], // pays: nothing to approve
      ["02-bank-change-bec.ja.txt", false], // payout_mismatch: the chain would refuse it
      ["05-credit-note.ja.txt", false], // document integrity
    ];
    for (const [file, approvable] of cases) {
      const analysis = await s.analyze(file);
      expect(analysis.approval, file).toEqual({ enabled: true, approvable });
      expect((await s.call("GET", `/invoices/${analysis.id}`)).body.approval, file).toEqual({ enabled: true, approvable });
    }
    const urgent = await s.analyze("07-urgent-invoice.ja.txt");
    s.h.idp.token = [approvedWith(await s.h.idp.sign())];
    const { attemptId } = await ask(s, urgent.id);
    await s.call("POST", `/invoices/${urgent.id}/pay`, { approvalId: attemptId });
    expect((await s.call("GET", `/invoices/${urgent.id}`)).body.approval).toEqual({ enabled: true, approvable: false }); // paid
  });

  it("still says approvable when World ID isn't configured, so the console can say why", async () => {
    const res = await createApp(fakeDeps()).request("/invoices/analyze", post({ text: demo("07-urgent-invoice.ja.txt") }));
    expect(((await res.json()) as { approval: unknown }).approval).toEqual({ enabled: false, approvable: true });
  });
});

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } };
}

async function analyzeWith(deps: AppDeps, file: string) {
  const res = await createApp(deps).request("/invoices/analyze", post({ text: demo(file) }));
  return (await res.json()) as { verdict: { decision: string; reasons: unknown[] } };
}
