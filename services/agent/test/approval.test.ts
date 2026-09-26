import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeDocument } from "../src/analysis/analyze.js";
import type { StoredAnalysis } from "../src/analysis/store.js";
import { loadConfig } from "../src/config.js";
import { packagePath } from "../src/wiring.js";
import { HttpError } from "../src/http.js";
import { demo, fakeDeps } from "./fakes.js";
import {
  approvalHarness,
  approvedWith,
  CLIENT_ID,
  CLIENT_SECRET,
  denied,
  DEVICE_CODE,
  expired,
  ISSUER,
  pending,
  slowDown,
  USER_CODE,
  type Harness,
} from "./mock-idp.js";

async function heldInvoice(): Promise<StoredAnalysis> {
  const deps = fakeDeps();
  const stored = await analyzeDocument(deps, demo("07-urgent-invoice.ja.txt"));
  deps.store.save(stored);
  return stored;
}

/** Starts an attempt and lets the poller run to its end. */
async function run(h: Harness, stored: StoredAnalysis) {
  const started = await h.approvals.start(stored);
  await h.approvals.settled(started.attemptId);
  return { started, state: h.approvals.status(stored.view.id)! };
}

describe("World ID device grant", () => {
  it("asks for scope openid with HTTP Basic client auth and never hands out the device code", async () => {
    const h = await approvalHarness({ hold: true });
    const started = await h.approvals.start(await heldInvoice());
    expect(started).toEqual({
      attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      userCode: USER_CODE,
      verificationUriComplete: `${ISSUER}/device?user_code=${USER_CODE}`,
      expiresAt: h.idp.clock.now + 1200,
      interval: 5,
    });
    expect(JSON.stringify(started)).not.toContain(DEVICE_CODE);
    const device = h.idp.requests.find((r) => r.url.endsWith("/api/v1/device_authorization"))!;
    expect(device.form.get("scope")).toBe("openid");
    expect(device.form.has("client_secret")).toBe(false);
    expect(device.headers.get("authorization")).toBe(`Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`);
  });

  it("can send the client credentials in the form instead (client_secret_post)", async () => {
    const h = await approvalHarness({ authMethod: "client_secret_post", hold: true });
    await h.approvals.start(await heldInvoice());
    const device = h.idp.requests.find((r) => r.url.endsWith("/api/v1/device_authorization"))!;
    expect(device.headers.get("authorization")).toBeNull();
    expect(device.form.get("client_id")).toBe(CLIENT_ID);
    expect(device.form.get("client_secret")).toBe(CLIENT_SECRET);
  });

  it("returns the pending attempt again instead of opening a second one", async () => {
    const h = await approvalHarness({ hold: true });
    const stored = await heldInvoice();
    const [a, b] = await Promise.all([h.approvals.start(stored), h.approvals.start(stored)]);
    const c = await h.approvals.start(stored);
    expect(new Set([a.attemptId, b.attemptId, c.attemptId]).size).toBe(1);
    expect(h.idp.requests.filter((r) => r.url.endsWith("/device_authorization"))).toHaveLength(1);
    expect(h.approvals.status(stored.view.id)).toMatchObject({ status: "pending", used: false });
  });

  it("polls at the interval, adds 5 s per slow_down, and approves only on a valid ID token", async () => {
    const h = await approvalHarness();
    h.idp.token = [pending, slowDown, pending, approvedWith(await h.idp.sign({ auth_time: h.idp.clock.now + 12 }))];
    const { state } = await run(h, await heldInvoice());
    expect(h.waits).toEqual([5000, 5000, 10000, 10000]);
    const polls = h.idp.requests.filter((r) => r.url.endsWith("/api/v1/token"));
    expect(polls.map((r) => r.form.get("grant_type"))).toEqual(Array(4).fill("urn:ietf:params:oauth:grant-type:device_code"));
    expect(polls[0]?.form.get("device_code")).toBe(DEVICE_CODE);
    expect(state).toMatchObject({ status: "approved", approver: "enrolled", used: false });
    expect(state.approvedAt).toBe(1_790_000_000 + 12);
    expect(JSON.stringify(state)).not.toMatch(/human-1|dc_secret/u);
  });

  it.each([
    ["access_denied", denied, "denied", "the person declined in the World ID app"],
    ["expired_token", expired, "expired", "nobody approved in time"],
    ["invalid_grant", { status: 400, body: { error: "invalid_grant" } }, "denied", "the World ID provider returned invalid_grant"],
    ["a 200 with no ID token", { status: 200, body: { access_token: "at" } }, "denied", "no ID token was issued"],
  ])("stops on %s", async (_label, reply, status, reason) => {
    const h = await approvalHarness();
    h.idp.token = [pending, reply];
    const { state } = await run(h, await heldInvoice());
    expect(state).toMatchObject({ status, reason });
  });

  it("expires by the clock when nobody answers within expires_in", async () => {
    const h = await approvalHarness();
    h.idp.token = [pending];
    const { state } = await run(h, await heldInvoice());
    expect(state).toMatchObject({ status: "expired" });
    expect(h.waits.reduce((a, b) => a + b, 0)).toBe(1200 * 1000);
  });

  it("treats 503 as unavailable (never approved) after backing off", async () => {
    const h = await approvalHarness();
    h.idp.token = [pending, { status: 503, body: {} }, { status: 503, body: {} }, { status: 503, body: {} }];
    const { state } = await run(h, await heldInvoice());
    expect(state).toMatchObject({ status: "unavailable", reason: "the World ID provider answered 503" });
    expect(h.waits).toEqual([5000, 5000, 10000, 20000]);
  });

  it("recovers from one network failure while polling", async () => {
    const h = await approvalHarness();
    h.idp.token = ["network", approvedWith(await h.idp.sign({ auth_time: h.idp.clock.now + 8 }))];
    const { state } = await run(h, await heldInvoice());
    expect(state.status).toBe("approved");
  });

  it("answers 503 when the device authorization itself fails", async () => {
    const h = await approvalHarness();
    h.idp.device = { status: 503, body: {} };
    const error = await h.approvals.start(await heldInvoice()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 503, code: "approval_unavailable" });
  });
});

describe("ID token validation", () => {
  const cases: [string, (h: Harness) => Promise<string>, string][] = [
    ["a stale auth_time", (h) => h.idp.sign({ auth_time: h.idp.clock.now - 60 }), "the proof predates this approval request"],
    ["a future auth_time", (h) => h.idp.sign({ auth_time: h.idp.clock.now + 3600 }), "the proof is dated in the future"],
    ["another audience", (h) => h.idp.sign({ aud: "app_someone_else" }), "the ID token's aud claim is wrong"],
    ["two audiences", (h) => h.idp.sign({ aud: [CLIENT_ID, "app_other"] }), "the ID token is for another client"],
    ["another issuer", (h) => h.idp.sign({ iss: "https://auth.evil.example" }), "the ID token's iss claim is wrong"],
    ["a non-Orb acr", (h) => h.idp.sign({ acr: "https://world.org/oidc/acr/device" }), "the ID token is not an Orb-verified World ID"],
    ["no auth_time", (h) => h.idp.sign({ auth_time: undefined }), "the ID token has no auth_time"],
    ["another signing key", (h) => h.idp.sign({}, { key: h.idp.otherKey }), "the ID token failed verification (ERR_JWS_SIGNATURE_VERIFICATION_FAILED)"],
    ["an unknown key id", (h) => h.idp.sign({}, { key: h.idp.otherKey, kid: "k2" }), "the ID token failed verification (ERR_JWKS_NO_MATCHING_KEY)"],
  ];

  it.each(cases)("rejects %s: denied, never approved", async (_label, token, message) => {
    const h = await approvalHarness();
    h.idp.token = [approvedWith(await token(h))];
    const { state } = await run(h, await heldInvoice());
    expect(state).toMatchObject({ status: "denied", reason: `invalid token: ${message}` });
  });

  it("rejects an expired token even with a fresh auth_time", async () => {
    const h = await approvalHarness();
    h.idp.clock.now -= 1000;
    const token = await h.idp.sign({ auth_time: h.idp.clock.now + 1000 }); // issued 1000 s ago, lived 300 s
    h.idp.clock.now += 1000;
    h.idp.token = [approvedWith(token)];
    const { state } = await run(h, await heldInvoice());
    expect(state).toMatchObject({ status: "denied", reason: "invalid token: the ID token has expired" });
  });

  it("is unavailable, not approved, when the signing keys can't be fetched", async () => {
    const h = await approvalHarness();
    h.idp.jwksUp = false;
    h.idp.token = [approvedWith(await h.idp.sign())];
    const { state } = await run(h, await heldInvoice());
    expect(state).toMatchObject({ status: "unavailable", reason: "the World ID provider's signing keys could not be fetched" });
  });
});

describe("World ID configuration", () => {
  const base = {
    SEPOLIA_RPC_URL: "http://127.0.0.1:8547",
    AGENT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    REGISTRY_ADDRESS: `0x${"22".repeat(20)}`,
    VAULT_ADDRESS: `0x${"33".repeat(20)}`,
    LLM_PROVIDER: "none",
  };

  it("resolves the approver file from services/agent, whatever the working directory", () => {
    const repo = fileURLToPath(new URL("../../../", import.meta.url));
    expect(packagePath("../../data/agent/approvers.json")).toBe(join(repo, "data/agent/approvers.json"));
    expect(packagePath("/var/lib/meigi/approvers.json")).toBe("/var/lib/meigi/approvers.json");
  });

  it("is off by default, never enrolls unless asked, and needs both client values together", () => {
    expect(loadConfig(base)).toMatchObject({ WORLD_AGENTS_ISSUER: ISSUER, WORLD_AGENTS_AUTH_METHOD: "client_secret_basic", WORLD_AGENTS_ENROLL: false });
    expect(loadConfig({ ...base, WORLD_AGENTS_ENROLL: "1" }).WORLD_AGENTS_ENROLL).toBe(true);
    expect(() => loadConfig({ ...base, WORLD_AGENTS_CLIENT_ID: "app_x" })).toThrow("WORLD_AGENTS_CLIENT_SECRET");
    expect(() => loadConfig({ ...base, WORLD_AGENTS_CLIENT_SECRET: "sk" })).toThrow("WORLD_AGENTS_CLIENT_ID");
  });

  it("wants an https issuer, except a local mock IdP, and never echoes the secret", () => {
    expect(() => loadConfig({ ...base, WORLD_AGENTS_ISSUER: "http://auth.example.com" })).toThrow("WORLD_AGENTS_ISSUER");
    expect(loadConfig({ ...base, WORLD_AGENTS_ISSUER: "http://127.0.0.1:8791/" }).WORLD_AGENTS_ISSUER).toBe("http://127.0.0.1:8791");
    const error = (() => {
      try {
        loadConfig({ ...base, WORLD_AGENTS_CLIENT_SECRET: "sk_do_not_print", WORLD_AGENTS_AUTH_METHOD: "none" });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(error?.message).toMatch(/WORLD_AGENTS_AUTH_METHOD/u);
    expect(error?.message).not.toContain("sk_do_not_print");
  });
});
