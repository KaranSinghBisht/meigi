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
const SIGNER_KEY = "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68";
const REF = `0x${"ab".repeat(32)}` as Hex;

/** The real signer app over a fake chain, reached through the remote payer's own fetch: the wire protocol, end to end. */
function setup(overrides: Partial<SignerPayer> = {}) {
  const sent: SignerCall[] = [];
  const events: { event: string; fields: Record<string, unknown> }[] = [];
  let mined = false;
  const payer: SignerPayer = {
    simulate: async () => ({ ok: true, payout: MEIGI }),
    send: async (call) => (sent.push(call), { ok: true, txHash: TX, payout: MEIGI }),
    receipt: async () => (mined ? { txHash: TX, status: "success", blockNumber: 101n } : null),
    ...overrides,
  };
  const app = createSignerApp({
    payer,
    token: TOKEN,
    policy: { ceilingUnits: 150_000n * 10n ** 18n, ceilingYen: 150_000, maxAgeS: 600, now: () => NOW },
    info: { agent: SIGNER_KEY, vault: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B", chainId: 11155111, humanAboveYen: 150_000 },
  });
  const fetcher = ((input: string, init?: RequestInit) => app.request(input.replace("http://127.0.0.1:8796", ""), init)) as typeof fetch;
  let polls = 0;
  const remote = createRemotePayer({
    url: "http://127.0.0.1:8796",
    token: TOKEN,
    fetch: fetcher,
    observe: (event, fields) => void events.push({ event, fields }),
    pollMs: 1,
    wait: async () => {
      polls += 1;
      if (polls === 2) mined = true; // mined on the third look
    },
  });
  return { remote, sent, app, events };
}

const call = (yen: number, approval?: PayCall["approval"]): PayCall => ({
  tNumber: 2011001234567n,
  expectedPayout: MEIGI,
  amount: BigInt(yen) * 10n ** 18n,
  invoiceRef: REF,
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
    expect(await remote.health()).toEqual({ agent: SIGNER_KEY, vault: "0x87A798CD92dE1340B1b761dd45196AC82bEF793B", chainId: 11155111, humanAboveYen: 150_000 });
    const { app } = setup();
    const stranger = createRemotePayer({ url: "http://127.0.0.1:8796", token: "wrong".repeat(10), fetch: ((i: string, init?: RequestInit) => app.request(i.replace("http://127.0.0.1:8796", ""), init)) as typeof fetch });
    await expect(stranger.simulate(call(1_000))).rejects.toMatchObject({ name: "SignerUnavailable", message: "the signer answered 401" });
  });
});

describe("the signer's exchanges, as the audit log gets them", () => {
  const call33k = { signerId: SIGNER_KEY, tNumber: "T2011001234567", invoiceRef: REF, payout: MEIGI, amount: (33_000n * 10n ** 18n).toString(), approval: false };

  it("names the signing key and its simulation, before the send and inside it", async () => {
    const { remote, events } = setup();
    await remote.simulate(call(33_000));
    await remote.send(call(33_000));
    expect(events).toEqual([
      { event: "signer.simulate", fields: { ...call33k, simulation: { ok: true, payout: MEIGI } } },
      { event: "signer.pay", fields: { ...call33k, outcome: "sent", txHash: TX, simulation: { ok: true, payout: MEIGI } } },
    ]);
  });

  it("records a refusal and a revert, and an approval only as present, never its token", async () => {
    const data = encodeErrorResult({ abi: agentVaultAbi, errorName: "InvoiceAlreadyPaid", args: [2011001234567n, REF, 33_000n * 10n ** 18n] } as never);
    const refusing = setup();
    const token = idToken({ acr: ORB_ACR, auth_time: NOW - 5 });
    await refusing.remote.send(call(160_000));
    await refusing.remote.send(call(160_000, { idToken: token }));
    expect(refusing.events.map((e) => [e.fields.outcome, e.fields.approval])).toEqual([["refused", false], ["sent", true]]);
    expect(refusing.events[0]?.fields.message).toBe("The signer refused: a payment above ¥150,000 needs a verified human's approval.");
    expect(JSON.stringify(refusing.events)).not.toContain(token.split(".")[1]);

    const reverting = setup({ send: async () => ({ ok: false, revert: { data } }) });
    await reverting.remote.send(call(33_000));
    expect(reverting.events).toEqual([{ event: "signer.pay", fields: { ...call33k, outcome: "reverted", simulation: { ok: false, revert: "InvoiceAlreadyPaid" } } }]);
  });

  it("records a send the signer never answered, since it may have signed", async () => {
    const events: { event: string; fields: Record<string, unknown> }[] = [];
    const down = createRemotePayer({
      url: "http://127.0.0.1:8796",
      token: TOKEN,
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
      observe: (event, fields) => void events.push({ event, fields }),
    });
    await expect(down.send(call(33_000))).rejects.toMatchObject({ name: "SignerUnavailable" });
    expect(events).toEqual([{ event: "signer.pay", fields: { ...call33k, signerId: null, outcome: "unreachable" } }]);
  });

  it("never lets a failing observer stop a payment", async () => {
    const { app } = setup();
    const quiet = createRemotePayer({
      url: "http://127.0.0.1:8796",
      token: TOKEN,
      fetch: ((input: string, init?: RequestInit) => app.request(input.replace("http://127.0.0.1:8796", ""), init)) as typeof fetch,
      observe: () => {
        throw new Error("disk full");
      },
      pollMs: 1,
      wait: async () => {},
      receiptTimeoutMs: 5,
    });
    const log = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => true;
    try {
      expect(await quiet.send(call(33_000))).toMatchObject({ ok: "pending", txHash: TX });
    } finally {
      process.stderr.write = log;
    }
  });
});
