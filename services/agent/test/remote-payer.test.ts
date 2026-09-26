import { createSignerApp, ORB_ACR, type PayCall as SignerCall, type SignerPayer } from "@meigi/signer";
import { encodeErrorResult, type Address, type Hex } from "viem";
import { agentVaultAbi } from "@meigi/abi";
import { describe, expect, it } from "vitest";
import { createRemotePayer } from "../src/chain/remote-payer.js";
import type { PayCall } from "../src/chain/types.js";

const TOKEN = "t".repeat(64);
const NOW = 1_790_000_000;
const MEIGI = "0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4" as Address;
const TX = `0x${"cd".repeat(32)}` as Hex;

/** The real signer app over a fake chain, reached through the remote payer's own fetch: the wire protocol, end to end. */
function setup(overrides: Partial<SignerPayer> = {}) {
  const sent: SignerCall[] = [];
  let mined = false;
  const payer: SignerPayer = {
    simulate: async () => ({ ok: true, payout: MEIGI }),
    send: async (call) => (sent.push(call), { ok: true, txHash: TX }),
    receipt: async () => (mined ? { txHash: TX, status: "success", blockNumber: 101n } : null),
    ...overrides,
  };
  const app = createSignerApp({
    payer,
    token: TOKEN,
    policy: { ceilingUnits: 150_000n * 10n ** 18n, ceilingYen: 150_000, maxAgeS: 600, now: () => NOW },
    info: { agent: "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68", vault: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B", chainId: 11155111, humanAboveYen: 150_000 },
  });
  const fetcher = ((input: string, init?: RequestInit) => app.request(input.replace("http://127.0.0.1:8796", ""), init)) as typeof fetch;
  let polls = 0;
  const remote = createRemotePayer({
    url: "http://127.0.0.1:8796",
    token: TOKEN,
    fetch: fetcher,
    pollMs: 1,
    wait: async () => {
      polls += 1;
      if (polls === 2) mined = true; // mined on the third look
    },
  });
  return { remote, sent, app };
}

const call = (yen: number, approval?: PayCall["approval"]): PayCall => ({
  tNumber: 2011001234567n,
  expectedPayout: MEIGI,
  amount: BigInt(yen) * 10n ** 18n,
  invoiceRef: `0x${"ab".repeat(32)}`,
  ...(approval ? { approval } : {}),
});

const idToken = (claims: Record<string, unknown>) =>
  ["h", claims, "s"].map((part, i) => (i === 1 ? Buffer.from(JSON.stringify(part)).toString("base64url") : part)).join(".");

describe("the agent's remote payer against the signer", () => {
  it("reports the tx as soon as the signer sends it, then waits for the receipt", async () => {
    const { remote, sent } = setup();
    const seen: Hex[] = [];
    const outcome = await remote.send(call(33_000), (txHash) => seen.push(txHash));
    expect(seen).toEqual([TX]);
    expect(outcome).toEqual({ ok: true, receipt: { txHash: TX, status: "success", blockNumber: 101n } });
    expect(sent[0]).toMatchObject({ tNumber: 2011001234567n, amount: 33_000n * 10n ** 18n });
  });

  it("gets the signer's refusal above its ceiling as an outcome, and forwards an approval", async () => {
    const { remote, sent } = setup();
    expect(await remote.send(call(160_000))).toEqual({ ok: "refused", message: "The signer refused: a payment above ¥150,000 needs a verified human's approval." });
    expect(sent).toEqual([]);
    const outcome = await remote.send(call(160_000, { idToken: idToken({ acr: ORB_ACR, auth_time: NOW - 5 }) }));
    expect(outcome).toMatchObject({ ok: true });
    expect(sent).toHaveLength(1);
  });

  it("decodes the signer's raw revert data against the Meigi ABIs", async () => {
    const data = encodeErrorResult({ abi: agentVaultAbi, errorName: "PayeeMismatch", args: [2011001234567n, "0xdCa52b5FA181a3307eCa852935BD40e3E0096d5b", MEIGI] } as never);
    const { remote } = setup({ simulate: async () => ({ ok: false, revert: { data } }) });
    const simulated = await remote.simulate(call(132_000));
    expect(simulated).toMatchObject({ ok: false, revert: { name: "PayeeMismatch" } });
  });

  it("reads the signer's identity, and fails with SignerUnavailable on a wrong token", async () => {
    const { remote } = setup();
    expect(await remote.health()).toEqual({ agent: "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68", vault: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B", chainId: 11155111, humanAboveYen: 150_000 });
    const { app } = setup();
    const stranger = createRemotePayer({ url: "http://127.0.0.1:8796", token: "wrong".repeat(10), fetch: ((i: string, init?: RequestInit) => app.request(i.replace("http://127.0.0.1:8796", ""), init)) as typeof fetch });
    await expect(stranger.simulate(call(1_000))).rejects.toMatchObject({ name: "SignerUnavailable", message: "the signer answered 401" });
  });
});
