import { HttpRequestError, keccak256, RpcRequestError, TimeoutError, TransactionNotFoundError, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { broadcast, type BroadcastRpc } from "../src/registry/broadcast.js";

const SIGNED = "0x02f86b83aa36a7018459682f00850ba43b7400825208949b4fc8994fcf2d5fe08a82a9454b61aa14d647e48080c080a0" as Hex;
const HASH = keccak256(SIGNED);

const down = () => new HttpRequestError({ url: "https://rpc.example", status: 403, details: "Cloudflare" });
const refused = (message: string) => new RpcRequestError({ body: {}, url: "https://rpc.example", error: { code: -32000, message } });
const notFound = () => new TransactionNotFoundError({ hash: HASH });

/** An RPC that records what it was sent, answers sends with `send`, and knows the hashes in `has`. */
function rpc(send: () => Hex | Error, has: Hex[] = []) {
  const sent: Hex[] = [];
  const node: BroadcastRpc & { sent: Hex[] } = {
    sent,
    async sendRawTransaction({ serializedTransaction }) {
      sent.push(serializedTransaction);
      const answer = send();
      if (answer instanceof Error) throw answer;
      has.push(HASH);
      return answer;
    },
    async getTransaction({ hash }) {
      if (!has.includes(hash)) throw notFound();
      return { hash };
    },
  };
  return node;
}

describe("broadcasting a signed registry transaction across the RPCs", () => {
  it("sends through the primary when it answers, and knows the hash before sending", async () => {
    const primary = rpc(() => HASH);
    const second = rpc(() => HASH);
    expect(await broadcast([primary, second], SIGNED)).toBe(HASH);
    expect([primary.sent, second.sent]).toEqual([[SIGNED], []]);
  });

  it("counts a send the primary took before its connection failed: no second broadcast", async () => {
    const known: Hex[] = [];
    const primary = rpc(() => (known.push(HASH), new TimeoutError({ body: {}, url: "https://rpc.example" })), known);
    const second = rpc(() => HASH, known);
    expect(await broadcast([primary, second], SIGNED)).toBe(HASH);
    expect(second.sent).toEqual([]); // the fallback was asked for the hash, and never sent anything
  });

  it("passes the same bytes to the fallback when the primary is down and nobody has the transaction", async () => {
    const primary = rpc(down);
    const second = rpc(() => HASH);
    expect(await broadcast([primary, second], SIGNED)).toBe(HASH);
    expect(second.sent).toEqual([SIGNED]); // the very same signed transaction, not a new signature
  });

  it("treats 'already known' as sent", async () => {
    const primary = rpc(down);
    const second = rpc(() => refused("already known"));
    expect(await broadcast([primary, second], SIGNED)).toBe(HASH);
  });

  it("treats a nonce collision as sent only when it is this very transaction", async () => {
    const mined: Hex[] = [HASH]; // our transaction took the nonce
    expect(await broadcast([rpc(() => refused("nonce too low"), mined)], SIGNED)).toBe(HASH);
    const other = rpc(() => refused("nonce too low")); // another transaction took it
    const second = rpc(() => HASH);
    await expect(broadcast([other, second], SIGNED)).rejects.toThrow(/nonce too low/u);
    expect(second.sent).toEqual([]); // a refusal isn't a transport error: the fallback isn't tried
  });

  it("reports failure when every RPC is down and none has the transaction", async () => {
    await expect(broadcast([rpc(down), rpc(down)], SIGNED)).rejects.toBeInstanceOf(HttpRequestError);
  });
});
