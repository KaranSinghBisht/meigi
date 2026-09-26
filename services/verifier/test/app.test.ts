import { recoverTypedDataAddress, zeroAddress, type Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { addressTarget, approvalTypedData } from "../src/registry/approvals.js";
import { enrollmentSignal } from "../src/routes/registrations.js";
import { officerIdFor } from "../src/world/session.js";
import { ATTESTER, CONTROLLER, FakeChain, PAYOUT, REGISTRY, fakeDeps, proof, selfieProof, sessionId } from "./fakes.js";

const T = 1010601051968n;
const NEW_PAYOUT = "0x3333333333333333333333333333333333333333";

let chain: FakeChain;
let deps: AppDeps;
let app: ReturnType<typeof createApp>;
const clock = { now: 1_790_000_000 };

async function post(path: string, body: unknown) {
  const res = await app.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function startRegistration(legalName = "Curvegrid株式会社") {
  return post("/registrations", { tNumber: "T1010601051968", legalName, domain: "curvegrid.co.jp", controller: CONTROLLER, payout: PAYOUT });
}

beforeEach(() => {
  chain = new FakeChain();
  clock.now = 1_790_000_000;
  deps = fakeDeps(chain, clock);
  app = createApp(deps);
});

describe("registration", () => {
  it("registers after an exact NTA match, a domain proof and a World ID officer", async () => {
    const created = await startRegistration();
    expect(created.status).toBe(201);
    expect(created.body.legalName).toBe("Ｃｕｒｖｅｇｒｉｄ株式会社");
    const id = created.body.id as string;

    expect((await post(`/registrations/${id}/domain`, {})).body).toEqual({ ok: true, method: "dns" });
    const officer = await post(`/registrations/${id}/officers`, { result: proof(sessionId("a"), "0x01", enrollmentSignal(id)) });
    expect(officer.body.officers).toBe(1);

    const submitted = await post(`/registrations/${id}/submit`, { threshold: 1 });
    expect(submitted.body).toMatchObject({ outcome: "registered", tNumber: "T1010601051968" });
    expect(chain.calls[0]).toBe(`register:${T}:1:${officerIdFor(sessionId("a"))}`);
  });

  it("stores and returns Self Check's sybil score, and nothing for any other credential", async () => {
    const id = (await startRegistration()).body.id as string;
    const selfie = await post(`/registrations/${id}/officers`, {
      result: selfieProof(sessionId("a"), "0x01", enrollmentSignal(id), 7),
    });
    expect(selfie.body.sybilScore).toBe(7);

    const other = await post(`/registrations/${id}/officers`, {
      result: proof(sessionId("b"), "0x02", enrollmentSignal(id)),
    });
    expect(other.body.sybilScore).toBeNull();
  });

  it("never accepts a fuzzy name", async () => {
    const res = await startRegistration("株式会社Curvegrid");
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "nta_name_mismatch", registered: "Ｃｕｒｖｅｇｒｉｄ株式会社" });
  });

  it("rejects an enrollment proof made for something else, and replays", async () => {
    const id = (await startRegistration()).body.id as string;
    const wrong = await post(`/registrations/${id}/officers`, { result: proof(sessionId("a"), "0x01", "other") });
    expect(wrong).toMatchObject({ status: 401, body: { code: "world_signal_mismatch" } });

    const good = proof(sessionId("a"), "0x02", enrollmentSignal(id));
    expect((await post(`/registrations/${id}/officers`, { result: good })).status).toBe(200);
    expect((await post(`/registrations/${id}/officers`, { result: good })).body.code).toBe("proof_replayed");
  });

  it("turns a second claim into a dispute instead of overwriting", async () => {
    await chain.register({ tNumber: T, legalName: "x", controller: "0x9999999999999999999999999999999999999999", payout: PAYOUT, officers: [], threshold: 1, evidence: "0x00" });
    const id = (await startRegistration()).body.id as string;
    await post(`/registrations/${id}/domain`, {});
    await post(`/registrations/${id}/officers`, { result: proof(sessionId("b"), "0x03", enrollmentSignal(id)) });
    const res = await post(`/registrations/${id}/submit`, { threshold: 1 });
    expect(res.body.outcome).toBe("disputed");
    expect(chain.calls.at(-1)).toBe(`dispute:${T}:${CONTROLLER}`);
  });
});

describe("payee lookup", () => {
  const record = { controller: CONTROLLER, payout: PAYOUT, pending: zeroAddress, nextController: zeroAddress, nonce: 1n, threshold: 1, officers: [] };

  it("names an active payee and shows its payout", async () => {
    chain.payees.set(T, { ...record, status: 1, legalName: "Curvegrid株式会社" });
    const body = (await (await app.request("/payees/T1010601051968")).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: "active", legalName: "Curvegrid株式会社", payout: PAYOUT });
  });

  it("never names a disputed payee or shows its payout: the record may be the claim under dispute", async () => {
    chain.payees.set(T, { ...record, status: 2, legalName: "株式会社フジデータ" });
    const body = (await (await app.request("/payees/T1010601051968")).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ tNumber: "T1010601051968", status: "disputed", legalName: null, payout: null });
    expect(JSON.stringify(body)).not.toContain("フジデータ");
  });
});

describe("approval intents", () => {
  const officerSession = sessionId("c");

  beforeEach(() => {
    const officerId = officerIdFor(officerSession);
    chain.payees.set(T, { status: 1, legalName: "Ｃｕｒｖｅｇｒｉｄ株式会社", controller: CONTROLLER, payout: PAYOUT, pending: zeroAddress,
      nextController: zeroAddress, nonce: 3n, threshold: 1, officers: [officerId] });
    deps.store.addOfficer("reg-1", "1010601051968", { officerId, sessionId: officerSession });
  });

  async function open(action: string, extra: Record<string, unknown> = {}) {
    return post("/intents", { tNumber: "T1010601051968", action, ...extra });
  }

  it("lets the enrolled officer approve a payout change, signed by the attester", async () => {
    const intent = await open("PayoutChange", { newAddress: NEW_PAYOUT });
    expect(intent.body.sessions).toEqual([{ officerId: officerIdFor(officerSession), sessionId: officerSession }]);

    const res = await post(`/intents/${intent.body.intentId}/approve`, { result: proof(officerSession, "0x10", intent.body.signal) });
    expect(res.body.status).toBe("approved");
    const approval = res.body.approval as { officerIds: Hex[]; deadline: string; signature: Hex };
    const typed = approvalTypedData({ chainId: 11155111, registry: REGISTRY, tNumber: T, action: "PayoutChange",
      target: addressTarget(NEW_PAYOUT), officerIds: approval.officerIds, nonce: 3n, deadline: BigInt(approval.deadline) });
    expect(await recoverTypedDataAddress({ ...typed, signature: approval.signature })).toBe(ATTESTER.address);
  });

  it("denies a different human", async () => {
    const intent = await open("PayoutChange", { newAddress: NEW_PAYOUT });
    const res = await post(`/intents/${intent.body.intentId}/approve`, { result: proof(sessionId("d"), "0x11", intent.body.signal) });
    expect(res).toMatchObject({ status: 403, body: { code: "not_an_officer" } });
  });

  it("refuses to sign against a stale nonce or after the deadline", async () => {
    const stale = await open("PayoutChange", { newAddress: NEW_PAYOUT });
    chain.payees.get(T)!.nonce = 4n;
    const res = await post(`/intents/${stale.body.intentId}/approve`, { result: proof(officerSession, "0x12", stale.body.signal) });
    expect(res.body.code).toBe("intent_stale");

    const late = await open("PayoutChange", { newAddress: NEW_PAYOUT });
    clock.now += 16 * 60;
    const expired = await post(`/intents/${late.body.intentId}/approve`, { result: proof(officerSession, "0x13", late.body.signal) });
    expect(expired.status).toBe(410);
  });

  it("lets any enrolled officer cancel a pending change at once", async () => {
    const intent = await open("CancelPayoutChange");
    const res = await post(`/intents/${intent.body.intentId}/approve`, { result: proof(officerSession, "0x14", intent.body.signal) });
    expect(res.body).toEqual({ status: "executed", txHash: "0xabc3" });
  });
});
