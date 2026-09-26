// `pnpm --filter @meigi/ai-proxy test`: the daily budget and the proxy against a fake Workers AI (node:test, no network).

import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import { describe, it } from "node:test";
import { CALL_CAP, NEURON_CAP, ProxyBudget, measured, worstCase, type BudgetStorage } from "./budget.ts";
import proxy, { type Env } from "./index.ts";

const TOKEN = "p".repeat(40);

// Workers adds a constant-time compare to SubtleCrypto; Node has it in node:crypto.
Object.assign(crypto.subtle, { timingSafeEqual: (a: Uint8Array, b: Uint8Array) => timingSafeEqual(a, b) });

function memoryStorage(): BudgetStorage {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => data.get(key) as T | undefined,
    put: async (key: string, value: unknown) => void data.set(key, structuredClone(value)),
  };
}

/** A proxy over one ProxyBudget and a fake AI binding that answers with `usage`, or throws. */
function setup(answer: (model: string, input: unknown) => unknown = () => ({ choices: [], usage: { prompt_tokens: 20, completion_tokens: 2 } })) {
  const budget = new ProxyBudget({ storage: memoryStorage() });
  const calls: string[] = [];
  const env: Env = {
    PROXY_TOKEN: TOKEN,
    AI: {
      run: async (model, input) => {
        calls.push(model);
        return answer(model, input);
      },
    },
    BUDGET: { idFromName: () => "global", get: () => ({ fetch: (input, init) => budget.fetch(new Request(input, init)) }) },
  };
  const post = async (path: string, body: unknown) => {
    const response = await proxy.fetch(new Request(`https://proxy.example${path}`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) }), env);
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const today = async () => (await (await budget.fetch(new Request(`https://budget/peek?day=${new Date().toISOString().slice(0, 10)}`))).json()) as { calls: number; neurons: number };
  return { post, calls, today, budget };
}

const chat = { messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 8 };

describe("the daily budget", () => {
  it("prices Llama 3.3 70B from tokens, and a chat call's worst case from its body and max_tokens", () => {
    assert.equal(measured({ usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } }), 26_668);
    assert.equal(measured({ usage: { prompt_tokens: 0, completion_tokens: 1_000_000 } }), 204_805);
    assert.equal(measured({ choices: [] }), null);
    assert.equal(worstCase(64 * 1024, 1024), 1958); // the largest call the proxy takes
  });

  it("settles a chat call to what Workers AI reports it cost", async () => {
    const { post, today } = setup();
    assert.equal((await post("/v1/chat", chat)).status, 200);
    assert.deepEqual(await today(), { calls: 1, neurons: measured({ usage: { prompt_tokens: 20, completion_tokens: 2 } }) });
  });

  it("keeps a failed call's reservation, since it may have cost something", async () => {
    const { post, today } = setup(() => {
      throw new Error("4006: you have used up your daily free allocation of 10,000 neurons");
    });
    const bytes = new TextEncoder().encode(JSON.stringify(chat)).byteLength;
    assert.equal((await post("/v1/chat", chat)).status, 502);
    assert.deepEqual(await today(), { calls: 1, neurons: worstCase(bytes, 8) });
  });

  it("answers 429 once the day's calls are spent, without calling Workers AI", async () => {
    const { post, calls } = setup(() => ({ answers: {} }));
    for (let i = 0; i < CALL_CAP; i++) assert.equal((await post("/v1/systemone", { state: {}, questions: {} })).status, 200);
    const refused = await post("/v1/systemone", { state: {}, questions: {} });
    assert.equal(refused.status, 429);
    assert.equal(refused.body.code, "daily_budget_spent");
    assert.equal(calls.length, CALL_CAP);
  });

  it("answers 429 before a call whose worst case would pass the day's neurons", async () => {
    const { post, calls, budget } = setup();
    const day = new Date().toISOString().slice(0, 10);
    await budget.fetch(new Request(`https://budget/reserve?day=${day}&neurons=${NEURON_CAP - 100}`, { method: "POST" }));
    const big = { messages: [{ role: "user", content: "x".repeat(4_000) }], max_tokens: 1024 }; // worst case over 100
    assert.deepEqual((await post("/v1/chat", big)).body, { code: "daily_budget_spent", message: "The proxy's daily neuron budget is spent; it resets at 00:00 UTC." });
    assert.equal((await post("/v1/chat", chat)).status, 200); // a small one still fits
    assert.equal(calls.length, 1);
  });

  it("starts each UTC day empty", async () => {
    const budget = new ProxyBudget({ storage: memoryStorage() });
    const reserve = (day: string) => budget.fetch(new Request(`https://budget/reserve?day=${day}&neurons=${NEURON_CAP}`, { method: "POST" }));
    assert.deepEqual(await (await reserve("2026-09-26")).json(), { ok: true });
    assert.deepEqual(await (await reserve("2026-09-26")).json(), { ok: false, spent: "neurons" });
    assert.deepEqual(await (await reserve("2026-09-27")).json(), { ok: true });
  });
});

describe("the proxy", () => {
  it("reports today's spend against the caps, to the token holder only", async () => {
    const { post, budget } = setup();
    await post("/v1/chat", chat);
    const env = { PROXY_TOKEN: TOKEN, BUDGET: { idFromName: () => "global", get: () => ({ fetch: (input: string, init?: RequestInit) => budget.fetch(new Request(input, init)) }) } } as unknown as Env;
    const read = (headers: HeadersInit = {}) => proxy.fetch(new Request("https://proxy.example/v1/budget", { headers }), env);
    assert.equal((await read()).status, 401);
    const today = (await (await read({ authorization: `Bearer ${TOKEN}` })).json()) as Record<string, unknown>;
    assert.deepEqual(today, { day: new Date().toISOString().slice(0, 10), calls: 1, neurons: measured({ usage: { prompt_tokens: 20, completion_tokens: 2 } }), callCap: CALL_CAP, neuronCap: NEURON_CAP });
  });

  it("answers only POSTs with the token, and forwards only each model's own fields", async () => {
    const seen: unknown[] = [];
    const { post } = setup((_model, input) => (seen.push(input), { usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    await post("/v1/chat", { ...chat, max_tokens: 99_999, stream: true, model: "@cf/other" });
    assert.deepEqual(seen, [{ messages: chat.messages, max_tokens: 1024, temperature: undefined }]);
    const env = { PROXY_TOKEN: TOKEN } as Env;
    assert.equal((await proxy.fetch(new Request("https://proxy.example/v1/chat", { method: "POST", body: "{}" }), env)).status, 401);
    assert.equal((await proxy.fetch(new Request("https://proxy.example/v1/chat"), env)).status, 405);
  });
});
