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
import { approversFrom, createApprovalVerifier, type Invoice, type VerifierOptions } from "../src/verify.js";

const ISSUER = "https://idp.example";
const CLIENT = "app_meigi";
const NOW = 1_790_000_000;
const STARTED = NOW - 3_600; // the signer started an hour ago
const APPROVER = "approver-sub";
const INVOICE_A: Invoice = { tNumber: 2011001234567n, invoiceRef: `0x${"aa".repeat(32)}` };
const INVOICE_B: Invoice = { tNumber: 2011001234567n, invoiceRef: `0x${"bb".repeat(32)}` };
const MEIGI = "0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4" as Address;

const provider = await generateKeyPair("RS256");
const stranger = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(provider.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

/** The provider's discovery document and keys, over a fake fetch that can be taken down. */
function idp(jwksUri = `${ISSUER}/jwks`) {
  const state = { up: true };
  const fetcher = (async (input: string | URL | Request) => {
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
  const options = { issuer: ISSUER, clientId: CLIENT, isApprover: (sub: string) => sub === APPROVER, maxAgeS: 600, now: () => NOW, startedAt: STARTED, fetch: fetcher };
  return { v: createApprovalVerifier({ ...options, ...overrides }), state };
}

const reasonOf = (verdict: { ok: boolean; reason?: string }) => (verdict.ok ? "accepted" : verdict.reason);

async function quietly<T>(run: () => Promise<T> | T): Promise<T> {
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  try {
    return await run();
  } finally {
    process.stderr.write = write;
  }
}

describe("Phase 2: the signer verifies an approval itself", () => {
  it("accepts a fresh Orb-level token from an approver, signed by the provider", async () => {
    const approverId = createHash("sha256").update(APPROVER).digest("hex").slice(0, 16);
    expect(await verifier().v.verify(await token(), INVOICE_A)).toMatchObject({ ok: true, approverId });
  });

  it("refuses what the Phase 1 claims check would let through", async () => {
    const { v } = verifier();
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const claimsOnly = `${part({ alg: "RS256", kid: "k1" })}.${part({ iss: ISSUER, aud: CLIENT, sub: APPROVER, acr: ORB_ACR, auth_time: NOW, exp: NOW + 60, iat: NOW })}.c2ln`;
    expect(reasonOf(await v.verify(claimsOnly, INVOICE_A))).toBe("is not signed by the World ID provider");
    expect(reasonOf(await v.verify(await token({}, stranger.privateKey), INVOICE_A))).toBe("is not signed by the World ID provider");
    expect(reasonOf(await v.verify(await token({ sub: "someone-else" }), INVOICE_A))).toBe("is from someone who is not an approver");
    expect(reasonOf(await v.verify("not-a-jwt", INVOICE_A))).toBe("is not a valid ID token");
  });

  it("checks the issuer, the audience, the assurance level and freshness", async () => {
    const { v } = verifier();
    const reason = async (claims: Record<string, unknown>) => reasonOf(await v.verify(await token(claims), INVOICE_A));
    expect(await reason({ iss: "https://evil.example" })).toBe("is from another issuer");
    expect(await reason({ aud: "another-app" })).toBe("is for another client");
    expect(await reason({ aud: [CLIENT, "another-app"] })).toBe("is for other clients too");
    expect(await reason({ acr: "device" })).toBe("is not an Orb-verified World ID");
    expect(await reason({ auth_time: NOW - 900 })).toBe("is more than 10 minutes old");
    expect(await reason({ auth_time: NOW + 600 })).toBe("is dated in the future");
    expect(await reason({ exp: NOW - 120 })).toBe("has expired");
  });

  it("refuses an approval made before the signer started, since spent ones are forgotten on a restart", async () => {
    const { v } = verifier({ startedAt: NOW - 45 });
    expect(reasonOf(await v.verify(await token({ auth_time: NOW - 60 }), INVOICE_A))).toBe("was made before this signer started; approve again");
  });

  it("reserves an approval for the first invoice it clears: that one may present it again, no other may", async () => {
    const { v } = verifier();
    const idToken = await token();
    expect((await v.verify(idToken, INVOICE_A)).ok).toBe(true);
    expect(reasonOf(await v.verify(idToken, INVOICE_B))).toBe("was already spent on another payment");
    expect(reasonOf(await v.verify(idToken, { ...INVOICE_A, tNumber: 6999900000003n }))).toBe("was already spent on another payment"); // same ref, other payee
    expect((await v.verify(idToken, INVOICE_A)).ok).toBe(true);
  });

  it("lets concurrent requests share an approval with one invoice only", async () => {
    const { v } = verifier();
    const idToken = await token();
    const invoices = [INVOICE_A, INVOICE_B, { tNumber: 2011001234567n, invoiceRef: `0x${"cc".repeat(32)}` as Hex }];
    const verdicts = await Promise.all(invoices.map((invoice) => v.verify(idToken, invoice)));
    expect(verdicts.filter((verdict) => verdict.ok)).toHaveLength(1);
  });

  it("refuses a spent token re-spelt: padding, whitespace or unused signature bits", async () => {
    const { v } = verifier();
    const idToken = await token();
    expect((await v.verify(idToken, INVOICE_A)).ok).toBe(true);
    const last = idToken.at(-1)!;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const flipped = `${idToken.slice(0, -1)}${alphabet[alphabet.indexOf(last) ^ 1]}`; // same bytes when the low bits are unused
    for (const respelt of [`${idToken} `, `${idToken}==`, `${idToken.slice(0, 20)}\n${idToken.slice(20)}`, flipped]) {
      expect((await v.verify(respelt, INVOICE_B)).ok).toBe(false);
    }
  });

  it("releases a reservation when nothing was sent, so the approval can still pay", async () => {
    const { v } = verifier();
    const idToken = await token();
    const first = await v.verify(idToken, INVOICE_A);
    if (!first.ok) throw new Error("expected the approval to pass");
    first.release();
    expect((await v.verify(idToken, INVOICE_B)).ok).toBe(true);
  });

  it("fails closed while the provider's keys are unreachable, and recovers when they're back", async () => {
    const { v, state } = verifier();
    state.up = false;
    expect(reasonOf(await quietly(async () => v.verify(await token(), INVOICE_A)))).toBe("could not be checked: the World ID provider's keys are unreachable");
    state.up = true;
    expect((await v.verify(await token(), INVOICE_A)).ok).toBe(true);
  });

  it("never fetches keys from outside the issuer's origin", async () => {
    const { fetcher } = idp("https://keys.evil.example/jwks");
    const { v } = verifier({ fetch: fetcher });
    expect(reasonOf(await quietly(async () => v.verify(await token(), INVOICE_A)))).toContain("could not be checked");
  });
});

describe("the approvers the signer accepts", () => {
  const dir = mkdtempSync(join(tmpdir(), "meigi-signer-approvers-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("follow the agent: its pinned subjects plus its enrolled ones, read afresh", async () => {
    const enrolledPath = join(dir, "approvers.json");
    const isApprover = approversFrom({ signerOnly: "", pinned: "pinned-1, pinned-2", enrolledPath });
    expect([isApprover("pinned-2"), isApprover("enrolled")]).toEqual([true, false]);
    writeFileSync(enrolledPath, JSON.stringify({ version: 1, subs: ["enrolled"] }));
    expect(isApprover("enrolled")).toBe(true);
    writeFileSync(enrolledPath, "{ not json");
    expect(await quietly(() => [isApprover("enrolled"), isApprover("pinned-1")])).toEqual([false, true]);
  });

  it("are only SIGNER_APPROVERS when the signer's own list is set: nothing the agent writes adds to it", () => {
    const enrolledPath = join(dir, "agent-enrolled.json");
    writeFileSync(enrolledPath, JSON.stringify({ version: 1, subs: ["enrolled-by-the-agent"] }));
    const isApprover = approversFrom({ signerOnly: "signer-pinned", pinned: "agent-pinned", enrolledPath });
    expect([isApprover("signer-pinned"), isApprover("agent-pinned"), isApprover("enrolled-by-the-agent")]).toEqual([true, false, false]);
  });
});

describe("the kill switch", () => {
  const required = {
    AGENT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
    SIGNER_TOKEN: "t".repeat(64),
    SEPOLIA_RPC_URL: "http://127.0.0.1:8545",
    VAULT_ADDRESS: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B",
  };

  it("is off unless SIGNER_VERIFY_APPROVAL=1, which needs the issuer and client; a mock IdP only on the local chain", () => {
    const phase2 = { ...required, SIGNER_VERIFY_APPROVAL: "1", WORLD_AGENTS_CLIENT_ID: CLIENT };
    expect(loadConfig(required).SIGNER_VERIFY_APPROVAL).toBe("0");
    expect(() => loadConfig({ ...required, SIGNER_VERIFY_APPROVAL: "1" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...phase2, WORLD_AGENTS_ISSUER: "http://idp.example" })).toThrow(/https/u);
    expect(() => loadConfig({ ...phase2, WORLD_AGENTS_ISSUER: "http://127.0.0.1:8791" })).toThrow(/31337/u); // Sepolia, the default chain
    expect(loadConfig({ ...phase2, WORLD_AGENTS_ISSUER: "http://127.0.0.1:8791", CHAIN_ID: "31337" }).SIGNER_VERIFY_APPROVAL).toBe("1");
    expect(() => loadConfig({ ...required, SIGNER_VERIFY_APPROVAL: "yes" })).toThrow(ConfigError);
  });
});

describe("/pay in each phase", () => {
  const TX = `0x${"cd".repeat(32)}` as Hex;
  const policy = { ceilingUnits: 150_000n * 10n ** 18n, ceilingYen: 150_000, maxAgeS: 600, now: () => NOW, issuer: ISSUER, clientId: CLIENT };
  const info = { agent: "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68" as Address, vault: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B" as Address, chainId: 11155111, humanAboveYen: 150_000 };

  function signer(phase2: boolean, send?: (call: PayCall) => Promise<Sent>) {
    const sent: PayCall[] = [];
    const payer: SignerPayer = {
      simulate: async () => ({ ok: true, payout: MEIGI }),
      send: send ?? (async (call) => (sent.push(call), { ok: true, txHash: TX, payout: MEIGI })),
      receipt: async () => null,
    };
    const app = createSignerApp({ payer, policy, token: "t".repeat(64), info: { ...info, verifiesApproval: phase2 }, verifier: phase2 ? verifier().v : undefined });
    const pay = async (yen: bigint, idToken: string | null, invoice: Invoice = INVOICE_A) => {
      const body = { tNumber: invoice.tNumber.toString(), payout: MEIGI, amount: (yen * 10n ** 18n).toString(), invoiceRef: invoice.invoiceRef, ...(idToken ? { approval: { idToken } } : {}) };
      const res = await app.request("/pay", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${"t".repeat(64)}` }, body: JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as Record<string, any> };
    };
    return { app, pay, sent };
  }

  it("Phase 1 trusts the agent to have checked the signature; Phase 2 doesn't", async () => {
    const forged = await token({}, stranger.privateKey);
    expect((await signer(false).pay(160_000n, forged)).status).toBe(200);
    expect(await signer(true).pay(160_000n, forged)).toMatchObject({
      status: 403,
      body: { code: "human_approval_required", message: "The signer refused: a payment above ¥150,000 needs a verified human's approval, and the one presented is not signed by the World ID provider." },
    });
  });

  it("Phase 2 verifies and spends any approval presented, below the ceiling too", async () => {
    const { pay, sent } = signer(true);
    const genuine = await token();
    expect(await pay(55_000n, genuine)).toMatchObject({ status: 200, body: { ok: true, approval: { verified: true, approverId: expect.stringMatching(/^[0-9a-f]{16}$/u) } } });
    expect(await pay(160_000n, genuine, INVOICE_B)).toMatchObject({ status: 403, body: { message: expect.stringContaining("was already spent on another payment") } });
    expect(await pay(55_000n, await token({}, stranger.privateKey), INVOICE_B)).toMatchObject({ status: 403, body: { message: "The signer refused: the human approval presented is not signed by the World ID provider." } });
    expect(await pay(55_000n, null, INVOICE_B)).toMatchObject({ status: 200 }); // no approval claimed, below the ceiling
    expect(sent).toHaveLength(2);
  });

  it("frees the approval when the chain refuses the payment, and claims nothing for a transaction already in flight", async () => {
    let answer: Sent = { ok: false, revert: { data: "0x12345678" } };
    const { pay } = signer(true, async () => answer);
    const genuine = await token();
    expect((await pay(160_000n, genuine)).body).toMatchObject({ ok: false });
    answer = { ok: true, txHash: TX, payout: MEIGI };
    expect((await pay(160_000n, genuine, INVOICE_B)).body).toMatchObject({ ok: true, approval: { verified: true } }); // freed, so B may use it
    answer = { ok: true, txHash: TX, payout: null };
    expect((await pay(160_000n, genuine, INVOICE_B)).body).toEqual({ ok: true, txHash: TX, signer: info.agent, simulation: null, inFlight: true });
  });

  it("says which phase is on", async () => {
    expect(await (await signer(true).app.request("/health")).json()).toMatchObject({ verifiesApproval: true });
    expect(await (await signer(false).app.request("/health")).json()).toMatchObject({ verifiesApproval: false });
  });
});
