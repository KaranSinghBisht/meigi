import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";
import { createSignerApp } from "../src/app.js";
import type { PayCall, Receipt, Revert, Sent, SignerPayer } from "../src/payer.js";
import { loadConfig } from "../src/config.js";
import { ORB_ACR } from "../src/policy.js";

/** The settings the signer can't start without (placeholders: nothing here signs). */
const REQUIRED_ENV = {
  AGENT_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  SIGNER_TOKEN: "t".repeat(64),
  SEPOLIA_RPC_URL: "http://127.0.0.1:8545",
  VAULT_ADDRESS: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B",
};

const TOKEN = "t".repeat(64);
const NOW = 1_790_000_000;
const MEIGI = "0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4";
const AGENT = "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68";
const REF = `0x${"ab".repeat(32)}`;
const TX = `0x${"cd".repeat(32)}` as Hex;
const units = (yen: number) => (BigInt(yen) * 10n ** 18n).toString();
const CEILING_YEN = loadConfig({ ...REQUIRED_ENV }).SIGNER_HUMAN_ABOVE_YEN; // the default, as the booth runs it

class FakePayer implements SignerPayer {
  simulated: PayCall[] = [];
  sent: PayCall[] = [];
  revert: Revert | null = null;
  mined: Receipt | null = null;
  async simulate(call: PayCall) {
    this.simulated.push(call);
    return this.revert ? { ok: false as const, revert: this.revert } : { ok: true as const, payout: MEIGI as Address };
  }
  async send(call: PayCall): Promise<Sent> {
    if (this.revert) return { ok: false as const, revert: this.revert };
    this.sent.push(call);
    return { ok: true as const, txHash: TX, payout: MEIGI as Address };
  }
  async receipt() {
    return this.mined;
  }
}

/** An ID token as World ID for Agents issues it; Phase 1 reads its claims, Phase 2 will check its signature. */
function idToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256", kid: "k1" })}.${part({ iss: "https://idp.example", aud: "client", sub: "s", exp: NOW + 300, iat: NOW - 5, ...claims })}.signature`;
}

function setup() {
  const payer = new FakePayer();
  const app = createSignerApp({
    payer,
    token: TOKEN,
    policy: { ceilingUnits: BigInt(units(CEILING_YEN)), ceilingYen: CEILING_YEN, maxAgeS: 600, now: () => NOW, issuer: "https://idp.example", clientId: "client" },
    info: { agent: AGENT, vault: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B", chainId: 11155111, humanAboveYen: CEILING_YEN },
  });
  const post = async (path: string, body: unknown, token = TOKEN) => {
    const res = await app.request(path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  return { app, payer, post };
}

const payment = (yen: number) => ({ tNumber: "2011001234567", payout: MEIGI, amount: units(yen), invoiceRef: REF });

describe("the signer", () => {
  it("answers /health openly, and everything else only with the token", async () => {
    const { app, post } = setup();
    expect(await (await app.request("/health")).json()).toMatchObject({ ok: true, humanAboveYen: 150_000 });
    expect((await post("/simulate", payment(1000), "wrong-token")).status).toBe(401);
    expect((await app.request("/receipt/0x00", { headers: {} })).status).toBe(401);
  });

  it("takes typed payInvoice fields only: no calldata, no extra fields", async () => {
    const { post, payer } = setup();
    expect((await post("/pay", { ...payment(1000), data: "0xdeadbeef" })).status).toBe(400);
    expect((await post("/pay", { to: MEIGI, data: "0xdeadbeef" })).status).toBe(400);
    expect((await post("/pay", { ...payment(1000), tNumber: "123" })).status).toBe(400);
    expect(payer.sent).toEqual([]);
  });

  it("simulates, and signs a payment up to the ceiling on the agent's word, naming its key and its simulation", async () => {
    const { post, payer } = setup();
    const signed = { ok: true, txHash: TX, signer: AGENT, simulation: { ok: true, payout: MEIGI } };
    expect((await post("/simulate", payment(33_000))).body).toEqual({ ok: true, payout: MEIGI, signer: AGENT });
    expect((await post("/pay", payment(132_000))).body).toEqual(signed); // the booth's routine invoice
    expect((await post("/pay", payment(150_000))).body).toEqual(signed);
    expect(payer.sent[0]).toEqual({ tNumber: 2011001234567n, expectedPayout: MEIGI, amount: 132_000n * 10n ** 18n, invoiceRef: REF });
    expect(payer.sent).toHaveLength(2);
  });

  it("refuses a payment above the ceiling without a fresh, Orb-level approval from our issuer and client", async () => {
    const { post, payer } = setup();
    const refused = async (approval?: { idToken: string }) => (await post("/pay", { ...payment(150_001), ...(approval ? { approval } : {}) })).body;
    expect(await refused()).toEqual({ code: "human_approval_required", message: "The signer refused: a payment above ¥150,000 needs a verified human's approval.", signer: AGENT });
    expect((await refused({ idToken: "not-a-jwt" })).message).toContain("not a JWT");
    expect((await refused({ idToken: idToken({ acr: "device", auth_time: NOW }) })).message).toContain("not an Orb-verified World ID");
    expect((await refused({ idToken: idToken({ acr: ORB_ACR, auth_time: NOW - 900 }) })).message).toContain("more than 10 minutes old");
    expect((await refused({ idToken: idToken({ acr: ORB_ACR, auth_time: NOW, iss: "https://evil.example" }) })).message).toContain("another issuer");
    expect((await refused({ idToken: idToken({ acr: ORB_ACR, auth_time: NOW, aud: "other" }) })).message).toContain("another client");
    expect(payer.sent).toEqual([]);
    expect((await post("/pay", { ...payment(150_001), approval: { idToken: idToken({ acr: ORB_ACR, auth_time: NOW - 30 }) } })).body).toMatchObject({ ok: true, txHash: TX });
  });

  it("says when it answered with the transaction already in flight, which it didn't simulate again", async () => {
    const { post, payer } = setup();
    payer.send = async () => ({ ok: true as const, txHash: TX, payout: null });
    expect((await post("/pay", payment(1000))).body).toEqual({ ok: true, txHash: TX, signer: AGENT, simulation: null, inFlight: true });
  });

  it("returns a revert as raw data for the agent to decode, and signs nothing", async () => {
    const { post, payer } = setup();
    payer.revert = { data: "0x12345678" };
    expect((await post("/simulate", payment(1000))).body).toEqual({ ok: false, revert: { data: "0x12345678" }, signer: AGENT });
    expect((await post("/pay", payment(1000))).body).toEqual({ ok: false, revert: { data: "0x12345678" }, signer: AGENT });
    expect(payer.sent).toEqual([]);
  });

  it("reports a receipt, with the block as a string", async () => {
    const { app, payer } = setup();
    const get = async () => (await app.request(`/receipt/${TX}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
    expect(await get()).toEqual({ receipt: null });
    payer.mined = { txHash: TX, status: "success", blockNumber: 11784298n };
    expect(await get()).toEqual({ receipt: { txHash: TX, status: "success", blockNumber: "11784298" } });
  });

  it("answers a chain failure generically", async () => {
    const { post, payer } = setup();
    payer.simulate = async () => {
      throw new Error("rpc down with secret-ish detail");
    };
    const log = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
    try {
      const failed = await post("/simulate", payment(1000));
      expect(failed).toEqual({ status: 502, body: { code: "chain_unavailable", message: "The signer could not reach the chain." } });
    } finally {
      process.stderr.write = log;
    }
  });
});
