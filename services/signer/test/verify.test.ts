import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import type { Address, Hex } from "viem";
import { afterAll, describe, expect, it } from "vitest";
import { createSignerApp } from "../src/app.js";
import { ConfigError, loadConfig } from "../src/config.js";
import type { PayCall, Sent, SignerPayer } from "../src/payer.js";
import { ORB_ACR } from "../src/policy.js";
import { approversFrom, createApprovalVerifier, type VerifierOptions } from "../src/verify.js";

const ISSUER = "https://idp.example";
const CLIENT = "app_meigi";
const NOW = 1_790_000_000;
const APPROVER = "approver-sub";
const REF_A = `0x${"aa".repeat(32)}` as Hex;
const REF_B = `0x${"bb".repeat(32)}` as Hex;
const MEIGI = "0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4" as Address;

const provider = await generateKeyPair("RS256");
const stranger = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(provider.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

/** The provider's discovery document and keys, over a fake fetch that can be taken down. */
function idp(jwksUri = `${ISSUER}/jwks`) {
  const state = { up: true, fetches: 0 };
  const fetcher = (async (input: string | URL | Request) => {
    state.fetches += 1;
    if (!state.up) throw new TypeError("fetch failed");
    const url = String(input instanceof Request ? input.url : input);
    if (url === `${ISSUER}/.well-known/openid-configuration`) return Response.json({ issuer: ISSUER, jwks_uri: jwksUri });
    if (url === jwksUri) return Response.json({ keys: [jwk] });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { state, fetcher };
}

/** An ID token as the provider issues it; `claims` override its defaults, `exp` included. */
async function token(claims: Record<string, unknown> = {}, key: CryptoKey = provider.privateKey) {
  return new SignJWT({ iss: ISSUER, aud: CLIENT, sub: APPROVER, acr: ORB_ACR, auth_time: NOW - 30, iat: NOW - 30, exp: NOW + 270, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .sign(key);
}

function verifier(overrides: Partial<VerifierOptions> = {}) {
  const { state, fetcher } = idp();
  const v = createApprovalVerifier({ issuer: ISSUER, clientId: CLIENT, isApprover: (sub) => sub === APPROVER, maxAgeS: 600, now: () => NOW, fetch: fetcher, ...overrides });
  return { v, state };
}

const quietly = async <T>(run: () => Promise<T>): Promise<T> => {
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  try {
    return await run();
  } finally {
    process.stderr.write = write;
  }
};

describe("Phase 2: the signer verifies an approval itself", () => {
  it("accepts a fresh Orb-level token from an approver, signed by the provider", async () => {
    const { v } = verifier();
    const approverId = createHash("sha256").update(APPROVER).digest("hex").slice(0, 16);
    expect(await v.verify(await token(), REF_A)).toEqual({ ok: true, approverId });
  });

  it("refuses what the Phase 1 claims check would let through", async () => {
    const { v } = verifier();
    const refused = async (idToken: string) => {
      const verdict = await v.verify(idToken, REF_A);
      return verdict.ok ? "accepted" : verdict.reason;
    };
    const claimsOnly = `${Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url")}.${Buffer.from(JSON.stringify({ iss: ISSUER, aud: CLIENT, sub: APPROVER, acr: ORB_ACR, auth_time: NOW, exp: NOW + 60, iat: NOW })).toString("base64url")}.c2ln`;
    expect(await refused(claimsOnly)).toBe("is not signed by the World ID provider");
    expect(await refused(await token({}, stranger.privateKey))).toBe("is not signed by the World ID provider");
    expect(await refused(await token({ sub: "someone-else" }))).toBe("is from someone who is not an approver");
    expect(await refused("not-a-jwt")).toBe("is not a valid ID token");
  });

  it("checks the issuer, the audience, the assurance level and freshness", async () => {
    const { v } = verifier();
    const reason = async (claims: Record<string, unknown>) => {
      const verdict = await v.verify(await token(claims), REF_A);
      return verdict.ok ? "accepted" : verdict.reason;
    };
    expect(await reason({ iss: "https://evil.example" })).toBe("is from another issuer");
    expect(await reason({ aud: "another-app" })).toBe("is for another client");
    expect(await reason({ aud: [CLIENT, "another-app"] })).toBe("is for other clients too");
    expect(await reason({ acr: "device" })).toBe("is not an Orb-verified World ID");
    expect(await reason({ auth_time: NOW - 900 })).toBe("is more than 10 minutes old");
    expect(await reason({ auth_time: NOW + 600 })).toBe("is dated in the future");
    expect(await reason({ exp: NOW - 120 })).toBe("has expired");
  });

  it("spends an approval on one invoice: that one may present it again, no other may", async () => {
    const { v } = verifier();
    const idToken = await token();
    expect((await v.verify(idToken, REF_A)).ok).toBe(true);
    v.spend(idToken, REF_A);
    expect(await v.verify(idToken, REF_B)).toEqual({ ok: false, reason: "was already spent on another payment" });
    expect((await v.verify(idToken, REF_A)).ok).toBe(true); // the same invoice: its transaction is already in flight
  });

  it("fails closed while the provider's keys are unreachable, and recovers when they're back", async () => {
    const { v, state } = verifier();
    state.up = false;
    expect(await quietly(async () => v.verify(await token(), REF_A))).toEqual({ ok: false, reason: "could not be checked: the World ID provider's keys are unreachable" });
    state.up = true;
    expect((await v.verify(await token(), REF_A)).ok).toBe(true);
  });

  it("never fetches keys from outside the issuer's origin", async () => {
    const { fetcher } = idp("https://keys.evil.example/jwks");
    const v = createApprovalVerifier({ issuer: ISSUER, clientId: CLIENT, isApprover: () => true, maxAgeS: 600, now: () => NOW, fetch: fetcher });
    expect(await quietly(async () => v.verify(await token(), REF_A))).toMatchObject({ ok: false, reason: expect.stringContaining("could not be checked") });
  });
});

describe("the approvers the signer accepts", () => {
  const dir = mkdtempSync(join(tmpdir(), "meigi-signer-approvers-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("are the pinned subjects plus the agent's enrolled ones, read afresh", () => {
    const path = join(dir, "approvers.json");
    const isApprover = approversFrom("pinned-1, pinned-2", path);
    expect([isApprover("pinned-2"), isApprover("enrolled")]).toEqual([true, false]);
    writeFileSync(path, JSON.stringify({ version: 1, subs: ["enrolled"] }));
    expect(isApprover("enrolled")).toBe(true);
    writeFileSync(path, "{ not json");
    expect(quietlySync(() => [isApprover("enrolled"), isApprover("pinned-1")])).toEqual([false, true]);
  });
});

function quietlySync<T>(run: () => T): T {
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  try {
    return run();
  } finally {
    process.stderr.write = write;
  }
}

describe("the kill switch", () => {
  const required = {
    AGENT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    SIGNER_TOKEN: "t".repeat(64),
    SEPOLIA_RPC_URL: "http://127.0.0.1:8545",
    VAULT_ADDRESS: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B",
  };

  it("is off unless SIGNER_VERIFY_APPROVAL=1, which needs the issuer and client", () => {
    expect(loadConfig(required).SIGNER_VERIFY_APPROVAL).toBe("0");
    expect(() => loadConfig({ ...required, SIGNER_VERIFY_APPROVAL: "1" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...required, SIGNER_VERIFY_APPROVAL: "1", WORLD_AGENTS_ISSUER: "http://idp.example", WORLD_AGENTS_CLIENT_ID: CLIENT })).toThrow(/https/u);
    expect(loadConfig({ ...required, SIGNER_VERIFY_APPROVAL: "1", WORLD_AGENTS_ISSUER: "http://127.0.0.1:8791", WORLD_AGENTS_CLIENT_ID: CLIENT }).SIGNER_VERIFY_APPROVAL).toBe("1");
    expect(() => loadConfig({ ...required, SIGNER_VERIFY_APPROVAL: "yes" })).toThrow(ConfigError);
  });

  it("switches /pay between the claims check (Phase 1) and full verification (Phase 2)", async () => {
    const sent: PayCall[] = [];
    const payer: SignerPayer = {
      simulate: async () => ({ ok: true, payout: MEIGI }),
      send: async (call): Promise<Sent> => (sent.push(call), { ok: true, txHash: `0x${"cd".repeat(32)}`, payout: MEIGI }),
      receipt: async () => null,
    };
    const policy = { ceilingUnits: 150_000n * 10n ** 18n, ceilingYen: 150_000, maxAgeS: 600, now: () => NOW, issuer: ISSUER, clientId: CLIENT };
    const info = { agent: "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68" as Address, vault: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B" as Address, chainId: 11155111, humanAboveYen: 150_000 };
    const pay = async (app: ReturnType<typeof createSignerApp>, idToken: string, invoiceRef: Hex) => {
      const body = { tNumber: "2011001234567", payout: MEIGI, amount: (160_000n * 10n ** 18n).toString(), invoiceRef, approval: { idToken } };
      const res = await app.request("/pay", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${"t".repeat(64)}` }, body: JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as Record<string, any> };
    };
    const forged = await token({}, stranger.privateKey);
    const phase1 = createSignerApp({ payer, policy, token: "t".repeat(64), info });
    expect((await pay(phase1, forged, REF_A)).status).toBe(200); // Phase 1 trusts the agent to have checked the signature

    const phase2 = createSignerApp({ payer, policy, token: "t".repeat(64), info: { ...info, verifiesApproval: true }, verifier: verifier().v });
    expect(await pay(phase2, forged, REF_A)).toMatchObject({
      status: 403,
      body: { code: "human_approval_required", message: "The signer refused: a payment above ¥150,000 needs a verified human's approval, and the one presented is not signed by the World ID provider." },
    });
    const genuine = await token();
    expect(await pay(phase2, genuine, REF_A)).toMatchObject({ status: 200, body: { ok: true, approval: { verified: true, approverId: expect.stringMatching(/^[0-9a-f]{16}$/u) } } });
    expect(await pay(phase2, genuine, REF_B)).toMatchObject({ status: 403, body: { message: expect.stringContaining("was already spent on another payment") } });
    expect(sent).toHaveLength(2); // Phase 1's forged one and Phase 2's genuine one
    expect(await (await phase2.request("/health")).json()).toMatchObject({ verifiesApproval: true });
  });
});
