import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createRemotePayer } from "../src/chain/remote-payer.js";
import type { AppDeps } from "../src/deps.js";
import { AGENT, demo, fakeDeps, MEIGI_PAYOUT, VAULT } from "./fakes.js";

const TX = `0x${"cd".repeat(32)}` as Hex;

/** A stopped signer: nothing listens on its port, so every connection is refused. */
const stopped = (async () => {
  throw new TypeError("fetch failed");
}) as typeof fetch;

/** A signer that answers every call, as scripts/ap-stack.sh --resume-signer brings it back. */
const answering = (async (input: string) => {
  const path = new URL(input).pathname;
  if (path === "/health") return Response.json({ agent: AGENT, vault: VAULT, chainId: 31337, humanAboveYen: 150_000 });
  if (path === "/simulate") return Response.json({ ok: true, payout: MEIGI_PAYOUT });
  if (path === "/pay") return Response.json({ ok: true, txHash: TX });
  return Response.json({ receipt: { txHash: TX, status: "success", blockNumber: "101" } });
}) as typeof fetch;

/** A signer that answers `path` with `status` (or not at all, for null), and everything else normally. */
const failingAt = (path: string, status: number | null) =>
  (async (input: string, init?: RequestInit) => {
    if (!new URL(input).pathname.startsWith(path)) return answering(input, init);
    return status === null ? stopped(input, init) : Response.json({ code: "error", message: "error" }, { status });
  }) as typeof fetch;

/** The agent with its real remote payer, over a signer the test can stop and start. Counts /pay calls. */
function agent(signerFetch: typeof fetch) {
  const events: { event: string; fields: Record<string, unknown> }[] = [];
  const wire = { fetch: signerFetch, pays: 0 };
  const signer = createRemotePayer({
    url: "http://127.0.0.1:8796",
    token: "t".repeat(64),
    fetch: ((input: string, init?: RequestInit) => {
      if (new URL(input).pathname === "/pay") wire.pays += 1;
      return wire.fetch(input, init);
    }) as typeof fetch,
    observe: (event, fields) => void events.push({ event, fields }),
    pollMs: 1,
    wait: async () => {},
  });
  const deps: AppDeps = { ...fakeDeps(), payer: signer, signer };
  const app = createApp(deps);
  const call = async (method: string, path: string, body?: unknown) => {
    const init: RequestInit = { method, headers: { "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await app.request(path, init);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  };
  const analyzed = async () => (await call("POST", "/invoices/analyze", { text: demo("01-routine-invoice.ja.txt") })).body;
  return { call, analyzed, events, wire };
}

describe("the agent with its signer stopped", () => {
  it("can't pay: it answers 503 before anything is signed, and pays once the signer is back", async () => {
    const { call, analyzed, events, wire } = agent(stopped);
    expect((await call("GET", "/health")).body.signer).toBe("unreachable");
    const analysis = await analyzed();
    expect(analysis.verdict.decision).toBe("pay");

    const refused = await call("POST", `/invoices/${analysis.id}/pay`);
    expect(refused).toEqual({
      status: 503,
      body: { code: "signer_unavailable", message: "The signer isn't answering, and the agent holds no key of its own: nothing was signed or sent." },
    });
    expect(events).toEqual([]); // no simulation answered, and no /pay was ever asked for
    expect(wire.pays).toBe(0);

    wire.fetch = answering;
    expect((await call("GET", "/health")).body.signer).toBe("ok");
    expect((await call("POST", `/invoices/${analysis.id}/pay`)).body).toMatchObject({ status: "paid", txHash: TX });
  });

  it("names what a signer that did answer said, still before anything is sent", async () => {
    for (const [status, said] of [
      [401, "The signer refused the agent's token (SIGNER_TOKEN must be the same in .env and .env.signer)"],
      [502, "The signer couldn't reach the chain"],
    ] as const) {
      const { call, analyzed, wire } = agent(failingAt("/simulate", status));
      const refused = await call("POST", `/invoices/${(await analyzed()).id}/pay`);
      expect(refused.status).toBe(503);
      expect(refused.body.message).toBe(`${said}, and the agent holds no key of its own: nothing was signed or sent.`);
      expect(wire.pays).toBe(0);
    }
  });

  it("hedges on an error answer during /pay, and says when an answer couldn't be read", async () => {
    const during = agent(failingAt("/pay", 502));
    const lost = await during.call("POST", `/invoices/${(await during.analyzed()).id}/pay`);
    expect(lost.body.message).toBe(
      "The signer couldn't reach the chain during the payment, so it may have been sent. Pay again once it answers: the vault refuses a second payment of this invoice.",
    );

    const garbled = agent(failingAt("/simulate", 200));
    const refused = await garbled.call("POST", `/invoices/${(await garbled.analyzed()).id}/pay`);
    expect(refused.body.message).toBe("The signer's answer couldn't be read, and the agent holds no key of its own: nothing was signed or sent.");
    expect(garbled.wire.pays).toBe(0);
  });

  it("says the payment may have been sent when the signer stops during /pay", async () => {
    const { call, analyzed, events } = agent(failingAt("/pay", null));
    const lost = await call("POST", `/invoices/${(await analyzed()).id}/pay`);
    expect(lost).toEqual({
      status: 503,
      body: {
        code: "signer_unavailable",
        message: "The signer stopped answering during the payment, so it may have been sent. Pay again once it answers: the vault refuses a second payment of this invoice.",
      },
    });
    expect(events.map((e) => [e.event, e.fields.outcome])).toEqual([
      ["signer.simulate", undefined],
      ["signer.pay", "unreachable"],
    ]);
  });

  it("keeps a sent payment pending when the signer stops before its receipt, and settles it without sending again", async () => {
    const { call, analyzed, wire } = agent(failingAt("/receipt/", null));
    const analysis = await analyzed();
    expect((await call("POST", `/invoices/${analysis.id}/pay`)).status).toBe(503);
    expect(wire.pays).toBe(1);

    wire.fetch = answering;
    expect((await call("POST", `/invoices/${analysis.id}/pay`)).body).toMatchObject({ status: "paid", txHash: TX });
    expect(wire.pays).toBe(1); // the second Pay only looked up the receipt
  });
});
