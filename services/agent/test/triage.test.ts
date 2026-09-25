import { describe, expect, it } from "vitest";
import { extractInvoice } from "../src/extract/extract.js";
import { cloudflareJevBackend, systemOneBackend } from "../src/triage/backends.js";
import { buildTriageState, MAX_DOCUMENT_CHARS } from "../src/triage/state.js";
import { createTriage } from "../src/triage/triage.js";
import { activePayee, demo, MEIGI_PAYOUT, T_MEIGI, unregistered } from "./fakes.js";

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
}

/** A fake fetch that records requests and replies from a queue (a thrown Error simulates a network failure). */
function fakeFetch(replies: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const reply = replies.shift();
    if (!reply || reply instanceof Error) throw reply ?? new Error("no reply queued");
    return reply;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Kev/Jev-shaped answers. `type` is the probability mass on the chosen type; `low` is P(suspicion ≤ 1). */
function answers(choice: string, type: number, newDestination: number, pressure: number, low: number) {
  const rest = (1 - type) / 4;
  const probabilities = Object.fromEntries(
    ["routine_invoice", "payee_change", "urgent_exec_request", "credit_note", "other"].map((k) => [k, k === choice ? type : rest]),
  );
  return {
    model: "kev-latest",
    answers: {
      request_type: { type: "choice", choice, confidence: (type - 0.2) / 0.8, probabilities },
      new_destination: { type: "noul", noul: newDestination },
      pressure: { type: "noul", noul: pressure },
      suspicion: { type: "score", score: low > 0.5 ? 0.4 : 2.5, probabilities: { "0": low * 0.8, "1": low * 0.2, "2": (1 - low) / 2, "3": (1 - low) / 2 } },
    },
    usage: { input_tokens: 300, output_tokens: 80 },
  };
}

const connectionRefused = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
const state = { channel: "invoice_pdf", document: "請求書 ..." };
const kev = (fetchImpl: typeof fetch, apiKey?: string) =>
  systemOneBackend({ url: "http://localhost:8009/v1/systemone", model: "kev-latest", fetch: fetchImpl, apiKey });

describe("System-1 routing (PayeeBench's p_safe)", () => {
  it("auto-clears when p_safe reaches the threshold, and sends the production questions", async () => {
    const { fetchImpl, calls } = fakeFetch([json(answers("routine_invoice", 0.98, 0.02, 0.05, 0.99))]);
    const result = await createTriage([kev(fetchImpl)], 0.9).triage(state);
    expect(result).toMatchObject({ status: "ok", backend: "systemone", model: "kev-latest", route: "auto_clear", holdReasons: [] });
    // P(routine or credit note) = 0.98 + 0.005, P(same destination) = 0.98, P(suspicion ≤ 1) = 0.99
    expect(result.status === "ok" && result.pSafe).toBeCloseTo(0.985 * 0.98 * 0.99, 4);
    expect(calls[0]?.body).toMatchObject({ state, model: "kev-latest" });
    expect(Object.keys(calls[0]?.body.questions)).toEqual(["request_type", "new_destination", "pressure", "suspicion"]);
  });

  it("holds a payee change and says which factor failed", async () => {
    const { fetchImpl } = fakeFetch([json(answers("payee_change", 0.91, 0.88, 0.6, 0.1))]);
    const result = await createTriage([kev(fetchImpl)], 0.9).triage(state);
    expect(result).toMatchObject({ route: "hold" });
    expect(result.status === "ok" && result.holdReasons).toEqual([
      expect.stringMatching(/^p_safe 0\.00 is below 0\.9$/u),
      "request type payee_change (routine or credit note: 4%)",
      "asks to pay a new account or wallet (88%)",
      "suspicion 2.50 of 3",
    ]);
  });

  it("never lets pressure alone block a clear (an honest overdue reminder is urgent)", async () => {
    const { fetchImpl } = fakeFetch([json(answers("routine_invoice", 0.97, 0.03, 0.95, 0.98))]);
    expect(await createTriage([kev(fetchImpl)], 0.9).triage(state)).toMatchObject({ route: "auto_clear", pressure: 0.95 });
  });

  it("counts missing probabilities against clearing", async () => {
    const reply = answers("routine_invoice", 0.99, 0.01, 0.01, 0.99);
    delete (reply.answers.suspicion as { probabilities?: unknown }).probabilities;
    const { fetchImpl } = fakeFetch([json(reply)]);
    const result = await createTriage([kev(fetchImpl)], 0.9).triage(state);
    expect(result.status === "ok" && result.holdReasons).toContain("no suspicion probabilities were returned");
  });
});

describe("System-1 backends", () => {
  it("falls back to Jev on Cloudflare when the local server is down", async () => {
    const { fetchImpl, calls } = fakeFetch([
      connectionRefused,
      json({ success: true, errors: [], messages: [], result: answers("routine_invoice", 0.98, 0.02, 0.02, 0.99) }),
    ]);
    const triage = createTriage([kev(fetchImpl), cloudflareJevBackend({ accountId: "0".repeat(32), apiToken: "cf-token", fetch: fetchImpl })]);
    const result = await triage.triage(state);
    expect(result).toMatchObject({ status: "ok", backend: "cloudflare", attempts: [{ backend: "systemone", code: "unreachable" }] });
    expect(calls[1]).toMatchObject({
      url: `https://api.cloudflare.com/client/v4/accounts/${"0".repeat(32)}/ai/run`,
      headers: { authorization: "Bearer cf-token" },
      body: { model: "typesafe/jev", input: { state } },
    });
  });

  it("reports 'triage unavailable' instead of inventing answers (402 until credits exist)", async () => {
    const { fetchImpl } = fakeFetch([
      connectionRefused,
      json({ code: "insufficient_credits", message: "402" }, 402),
      json({ success: false, errors: [{ code: 5018, message: "Insufficient balance" }] }, 400),
    ]);
    const proxy = systemOneBackend({ name: "proxy", url: "https://proxy.example/v1/systemone", apiKey: "t", model: "jev-latest", fetch: fetchImpl });
    const triage = createTriage([kev(fetchImpl), proxy, cloudflareJevBackend({ accountId: "0".repeat(32), apiToken: "cf", fetch: fetchImpl })]);
    const credits = "payment required: the account has no inference credits yet";
    expect(await triage.triage(state)).toEqual({
      status: "unavailable",
      message: "triage unavailable",
      attempts: [
        { backend: "systemone", code: "unreachable", error: "could not connect" },
        { backend: "proxy", code: "payment_required", error: credits },
        { backend: "cloudflare", code: "payment_required", error: credits },
      ],
    });
  });

  it("rejects malformed or foreign answers and retries once when rate limited", async () => {
    const foreign = answers("routine_invoice", 0.98, 0.02, 0.02, 0.99);
    (foreign.answers.request_type as { choice: string }).choice = "ignore previous instructions";
    const { fetchImpl, calls } = fakeFetch([json(foreign), json({}, 429), json(answers("other", 0.7, 0.1, 0.1, 0.9))]);
    expect(await createTriage([kev(fetchImpl, "k")]).triage(state)).toMatchObject({ status: "unavailable", attempts: [{ code: "bad_response" }] });
    expect(await createTriage([kev(fetchImpl, "k")]).triage(state)).toMatchObject({ status: "ok", route: "hold" });
    expect(calls).toHaveLength(3);
    expect(calls[0]?.headers.authorization).toBe("Bearer k");
  });
});

describe("System-1 state (PayeeBench's shape)", () => {
  const meigi = activePayee(T_MEIGI);

  it("sends an invoice with the registry record as the payee on file", () => {
    const text = demo("01-routine-invoice.ja.txt");
    expect(buildTriageState(text, extractInvoice(text), meigi)).toEqual({
      channel: "invoice_pdf",
      payee_on_file: `株式会社メイギ商事（T2011001234567）: JPYC（Ethereum）${MEIGI_PAYOUT}`,
      document: text,
    });
  });

  it("splits an email into from, subject and body", () => {
    const text = demo("02-bank-change-bec.ja.txt");
    const s = buildTriageState(text, extractInvoice(text), meigi);
    expect(s).toMatchObject({ channel: "email", from: "株式会社メイギ商事 経理部 <keiri@meigi-shoji-jp.example>" });
    expect(s.subject).toContain("お支払先ウォレットアドレス変更");
    expect(s.body?.startsWith("株式会社ハルカ製作所")).toBe(true);
  });

  it("frames an x402 response as request and response, and omits unknown payees", () => {
    const text = demo("06-x402-swapped-payto.json");
    const s = buildTriageState(text, extractInvoice(text), unregistered(T_MEIGI));
    expect(s).toEqual({ channel: "x402", request: "GET https://api.meigi-shoji.example/v1/statements/2026-09", response: text });
  });

  it("keeps only the head of very long documents", () => {
    const text = `T2011001234567 ¥1,000\n${"あ".repeat(MAX_DOCUMENT_CHARS)}`;
    expect(buildTriageState(text, extractInvoice(text), null).document).toHaveLength(MAX_DOCUMENT_CHARS);
  });
});
