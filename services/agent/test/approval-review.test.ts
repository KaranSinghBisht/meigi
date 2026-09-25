import { base64url, createLocalJWKSet, exportJWK, exportSPKI, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { analyzeDocument } from "../src/analysis/analyze.js";
import { createApp } from "../src/app.js";
import { createApprovals } from "../src/approval/approvals.js";
import { createApproverRegistry } from "../src/approval/approvers.js";
import { pollOnce } from "../src/approval/device.js";
import { createIdp, IdpUnavailable } from "../src/approval/idp.js";
import { ORB_ACR, TokenRejected, validateIdToken } from "../src/approval/token.js";
import { traceIdToken } from "../src/approval/trace.js";
import { demo, fakeDeps } from "./fakes.js";
import { approvalHarness, approvedWith, CLIENT_ID, denied, ISSUER, mockIdp } from "./mock-idp.js";

/** Regression tests from the security review of human approval (probe.test.ts and auth.test.ts). */

const NOW = 1_790_000_000;
const claims = { iss: ISSUER, aud: CLIENT_ID, sub: "h", acr: ORB_ACR, auth_time: NOW };
const json = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const DISCO = {
  device_authorization_endpoint: `${ISSUER}/api/v1/device_authorization`,
  token_endpoint: `${ISSUER}/api/v1/token`,
  jwks_uri: `${ISSUER}/.well-known/jwks.json`,
};

async function keyCtx() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  return { publicKey, privateKey, ctx: { keys: createLocalJWKSet({ keys: [jwk] }), issuer: ISSUER, clientId: CLIENT_ID, startedAt: NOW, now: NOW + 5 } };
}

type Seen = { url: string; init: RequestInit | undefined }[];

function idpWith(disco: Record<string, string>, handler: (url: string) => Response, seen: Seen = []) {
  return createIdp({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: "SECRET_XYZ",
    authMethod: "client_secret_basic",
    timeoutMs: 1000,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push({ url, init });
      return url === `${ISSUER}/.well-known/openid-configuration` ? json(200, { issuer: ISSUER, ...disco }) : handler(url);
    }) as typeof fetch,
  });
}

describe("ID tokens (LOW: exp was optional)", () => {
  it.each(["exp", "iat", "sub", "auth_time"])("rejects a token with no %s", async (claim) => {
    const k = await keyCtx();
    const body: Record<string, unknown> = { ...claims, iat: NOW, exp: NOW + 300 };
    delete body[claim];
    const token = await new SignJWT(body).setProtectedHeader({ alg: "RS256", kid: "k1" }).sign(k.privateKey);
    await expect(validateIdToken(token, k.ctx)).rejects.toThrow(new TokenRejected(`the ID token has no ${claim}`));
  });

  it("rejects alg none and HS256 keyed with the public key", async () => {
    const k = await keyCtx();
    const full = { ...claims, iat: NOW, exp: NOW + 300 };
    const none = `${base64url.encode(JSON.stringify({ alg: "none", kid: "k1" }))}.${base64url.encode(JSON.stringify(full))}.`;
    await expect(validateIdToken(none, k.ctx)).rejects.toBeInstanceOf(TokenRejected);
    const hs = await new SignJWT(full).setProtectedHeader({ alg: "HS256", kid: "k1" }).sign(new TextEncoder().encode(await exportSPKI(k.publicKey)));
    await expect(validateIdToken(hs, k.ctx)).rejects.toBeInstanceOf(TokenRejected);
  });

  it("reports an unreachable, failing or garbled key set as unavailable, never as a verdict on the token", async () => {
    const k = await keyCtx();
    const token = await new SignJWT({ ...claims, iat: NOW, exp: NOW + 300 }).setProtectedHeader({ alg: "RS256", kid: "k1" }).sign(k.privateKey);
    const replies = [
      () => {
        throw new TypeError("fetch failed");
      },
      () => json(500, "oops"),
      () => json(200, "not json"),
      () => json(200, { keys: "nope" }),
    ];
    for (const reply of replies) {
      const idp = idpWith(DISCO, reply);
      const error = await validateIdToken(token, { ...k.ctx, keys: await idp.keys() }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(IdpUnavailable);
    }
  });
});

describe("discovery is pinned to the issuer (LOW)", () => {
  it("refuses endpoints on another origin, so the secret and device code never go there", async () => {
    for (const bad of [{ token_endpoint: "http://evil.example/token" }, { jwks_uri: "https://evil.example/jwks" }, { device_authorization_endpoint: "https://sandbox.auth.world.org.evil.example/d" }]) {
      const seen: Seen = [];
      const idp = idpWith({ ...DISCO, ...bad }, () => json(400, { error: "authorization_pending" }), seen);
      await expect(idp.discovery()).rejects.toThrow("the discovery document points outside the issuer's origin");
      expect(await pollOnce(idp, "DEVICE_CODE_SECRET")).toMatchObject({ kind: "unavailable" });
      expect(seen.every((s) => s.url.startsWith(`${ISSUER}/`))).toBe(true);
    }
  });

  it("never follows a redirect: every IdP request says redirect: error", async () => {
    const idp = await mockIdp();
    const seen: RequestInit[] = [];
    const client = createIdp({
      issuer: ISSUER,
      clientId: CLIENT_ID,
      clientSecret: "s",
      authMethod: "client_secret_basic",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init ?? {});
        return idp.fetch(input, init);
      }) as typeof fetch,
    });
    await pollOnce(client, "dc");
    const key = await client.keys();
    await Promise.resolve()
      .then(() => key({ alg: "RS256", kid: "k1" }, { payload: "", signature: "", protected: "" } as never))
      .catch(() => undefined); // fetches the key set
    expect(seen.length).toBeGreaterThanOrEqual(3); // discovery, token, key set
    expect(seen.every((init) => init.redirect === "error")).toBe(true);
  });

  it("never approves on an odd token response", async () => {
    const replies = [json(200, "garbage"), json(200, { id_token: 5 }), json(200, {}), json(400, { error: "AUTHORIZATION_PENDING" }), json(429, {}), json(302, {}), json(503, {}), json(401, { error: "invalid_client" })];
    for (const reply of replies) {
      const poll = await pollOnce(idpWith(DISCO, () => reply.clone()), "dc");
      expect(poll.kind, String(reply.status)).not.toBe("approved");
    }
  });
});

describe("approvals over HTTP (HIGH, single use, spend window, auth)", () => {
  async function setup(holds?: { maxPressure: number; autoClearMaxYen: number | null }, apiToken: string | null = null) {
    const h = await approvalHarness();
    const deps = { ...fakeDeps(), approvals: h.approvals, apiToken, ...(holds ? { holds } : {}) };
    const app = createApp(deps);
    const call = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const init = body === undefined ? { headers } : { ...post(body), headers: { "content-type": "application/json", ...headers } };
      const res = await app.request(path, init);
      return { status: res.status, body: (await res.json()) as Record<string, any> };
    };
    return { h, deps, call };
  }

  it("force pays nothing on approvable holds and never touches the IdP", async () => {
    const cases = [
      ["07-urgent-invoice.ja.txt", undefined],
      ["01-routine-invoice.ja.txt", { maxPressure: 0.5, autoClearMaxYen: 100_000 }],
    ] as const;
    for (const [file, holds] of cases) {
      const s = await setup(holds);
      const analysis = (await s.call("/invoices/analyze", { text: demo(file) })).body;
      const forced = await s.call(`/invoices/${analysis.id}/pay`, { force: true });
      expect(forced.body.reasons, file).toEqual([expect.objectContaining({ code: "force_needs_human" })]);
      expect(s.deps.payer.sent).toEqual([]);
      expect(s.h.idp.requests).toEqual([]);
    }
  });

  it("sends once when two pays race on one approval", async () => {
    const s = await setup();
    const analysis = (await s.call("/invoices/analyze", { text: demo("07-urgent-invoice.ja.txt") })).body;
    s.h.idp.token = [approvedWith(await s.h.idp.sign())];
    const started = (await s.call(`/invoices/${analysis.id}/approval`, {})).body;
    await s.h.approvals.settled(started.attemptId);
    const both = await Promise.all([1, 2].map(() => s.call(`/invoices/${analysis.id}/pay`, { approvalId: started.attemptId })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(s.deps.payer.sent).toHaveLength(1);
  });

  it("expires an approval that isn't spent within 10 minutes", async () => {
    const s = await setup();
    const analysis = (await s.call("/invoices/analyze", { text: demo("07-urgent-invoice.ja.txt") })).body;
    s.h.idp.token = [approvedWith(await s.h.idp.sign())];
    const started = (await s.call(`/invoices/${analysis.id}/approval`, {})).body;
    await s.h.approvals.settled(started.attemptId);
    s.h.idp.clock.now += 600;
    const late = await s.call(`/invoices/${analysis.id}/pay`, { approvalId: started.attemptId });
    expect(late).toEqual({ status: 409, body: { code: "approval_not_approved", message: "the approval is expired: nothing was paid" } });
    expect(s.deps.payer.sent).toEqual([]);
  });

  it("needs the API token to start an approval or pay with one; the open GET shows no code", async () => {
    const TOKEN = "t".repeat(32);
    const s = await setup(undefined, TOKEN);
    const auth = { authorization: `Bearer ${TOKEN}` };
    const analysis = (await s.call("/invoices/analyze", { text: demo("07-urgent-invoice.ja.txt") }, auth)).body;
    expect((await s.call(`/invoices/${analysis.id}/approval`, {})).status).toBe(401);
    s.h.idp.token = [approvedWith(await s.h.idp.sign())];
    const started = (await s.call(`/invoices/${analysis.id}/approval`, {}, auth)).body;
    await s.h.approvals.settled(started.attemptId);
    const open = await s.call(`/invoices/${analysis.id}/approval`);
    expect(open.status).toBe(200);
    expect(open.body).not.toHaveProperty("userCode");
    expect(open.body).not.toHaveProperty("verificationUriComplete");
    expect((await s.call(`/invoices/${analysis.id}/pay`, { approvalId: started.attemptId })).status).toBe(401);
    expect(s.deps.payer.sent).toEqual([]);
  });
});

describe("pollers are bounded (LOW)", () => {
  const held = () => analyzeDocument(fakeDeps(), demo("07-urgent-invoice.ja.txt"));

  it("caps live pollers and answers 429 approval_busy beyond the cap", async () => {
    const h = await approvalHarness({ hold: true });
    for (let i = 0; i < 8; i++) await h.approvals.start(await held());
    await expect(h.approvals.start(await held())).rejects.toMatchObject({ status: 429, code: "approval_busy" });
  });

  it("opens at most one new attempt per invoice per interval", async () => {
    const h = await approvalHarness({ hold: true });
    const stored = await held();
    await h.approvals.start(stored);
    const changed = { ...stored, intent: { ...stored.intent!, amount: stored.intent!.amount + 1n } }; // a new snapshot
    await expect(h.approvals.start(changed)).rejects.toMatchObject({ status: 429, code: "approval_too_soon" });
    h.idp.clock.now += 5;
    await expect(h.approvals.start(changed)).resolves.toMatchObject({ attemptId: expect.any(String) });
  });

  it("stops the poller of an evicted attempt", async () => {
    const idp = await mockIdp();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const client = createIdp({ issuer: ISSUER, clientId: CLIENT_ID, clientSecret: "s", authMethod: "client_secret_basic", fetch: idp.fetch });
    const approvals = createApprovals({
      idp: client,
      approvers: createApproverRegistry({ allowed: [], path: null, enroll: false }),
      now: () => idp.clock.now,
      wait: async () => gate,
      limits: { maxAttempts: 2 },
    });
    idp.token = [denied];
    const [a, b, c] = [await held(), await held(), await held()];
    await approvals.start(a);
    const second = await approvals.start(b);
    const third = await approvals.start(c); // evicts a's attempt
    expect(approvals.status(a.view.id)).toBeNull();
    release();
    await Promise.all([approvals.settled(second.attemptId), approvals.settled(third.attemptId)]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(idp.requests.filter((r) => r.url.endsWith("/api/v1/token"))).toHaveLength(2); // a never polled again
  });
});

describe("token trace for rehearsals (WORLD_AGENTS_TRACE)", () => {
  it("logs the claims' shape and never the sub or the token", async () => {
    const k = await keyCtx();
    const sub = "0x2ae86d6d747702b3b2c81811cd2b39875e8fa6b780ee4a207bdc203a7860b535";
    const token = await new SignJWT({ ...claims, sub, amr: ["pop"], iat: NOW, exp: NOW + 300 }).setProtectedHeader({ alg: "RS256", kid: "k1" }).sign(k.privateKey);
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      traceIdToken(token, { issuer: ISSUER, clientId: CLIENT_ID, startedAt: NOW - 10 });
      const line = String(write.mock.calls[0]?.[0]);
      expect(line).toContain(`acr ${ORB_ACR}`);
      expect(line).toContain('amr ["pop"]');
      expect(line).toContain("sub 66 chars, 0x + hex");
      expect(line).toContain("auth_time attempt start +10 s; lifetime 300 s");
      expect(line).not.toContain(sub.slice(2, 12));
      expect(line).not.toContain(token.slice(0, 20));
    } finally {
      write.mockRestore();
    }
  });
});
