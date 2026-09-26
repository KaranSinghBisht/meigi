/**
 * Meigi AI proxy (Cloudflare Worker). One authenticated endpoint per model family:
 *   POST /v1/systemone  → TypeSafe Jev (System-1 typed decisions), billed via AI Gateway credits
 *   POST /v1/chat       → Workers AI Llama (proposals and explanations), inside the free daily neurons
 *   GET  /v1/budget     → today's calls and neurons against the caps
 * Every request needs `Authorization: Bearer <PROXY_TOKEN>` (a Worker secret). A daily budget (budget.ts) answers
 * 429 once the day's calls or neurons are spent, so the account's paid plan never bills for it.
 */

import { CALL_CAP, NEURON_CAP, ProxyBudget, measured, utcDay, worstCase, type Reserved } from "./budget.ts";

export { ProxyBudget };

interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

interface BudgetNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> };
}

export interface Env {
  AI: AiBinding;
  PROXY_TOKEN: string;
  BUDGET: BudgetNamespace;
}

/** Workers extends SubtleCrypto with a constant-time comparison. */
type WorkersSubtle = SubtleCrypto & { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean };

const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_TOKENS = 1024;
const DEFAULT_TOKENS = 512;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!env.PROXY_TOKEN || presented.length !== env.PROXY_TOKEN.length) return false;
  const encoder = new TextEncoder();
  return (crypto.subtle as WorkersSubtle).timingSafeEqual(encoder.encode(presented), encoder.encode(env.PROXY_TOKEN));
}

/** The JSON body and its size in bytes (what a chat call reserves for), or null. */
async function readBody(request: Request): Promise<{ body: Record<string, unknown>; bytes: number } | null> {
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_BODY_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(raw));
    return parsed && typeof parsed === "object" ? { body: parsed as Record<string, unknown>, bytes: raw.byteLength } : null;
  } catch {
    return null;
  }
}

interface Target {
  model: string;
  input: unknown;
  neurons: number; // the most this call can cost; 0 for Jev, which spends credits
}

/** Only forwards the fields each model takes, so callers can't smuggle other options through. */
function route(pathname: string, body: Record<string, unknown>, bytes: number): Target | null {
  if (pathname === "/v1/systemone") {
    return { model: "typesafe/jev", input: { state: body.state, questions: body.questions }, neurons: 0 };
  }
  if (pathname === "/v1/chat") {
    const maxTokens = typeof body.max_tokens === "number" && body.max_tokens > 0 ? Math.min(Math.floor(body.max_tokens), MAX_TOKENS) : DEFAULT_TOKENS;
    const input = { messages: body.messages, max_tokens: maxTokens, temperature: body.temperature };
    return { model: CHAT_MODEL, input, neurons: worstCase(bytes, maxTokens) };
  }
  return null;
}

function budgetOf(env: Env, now: number) {
  const stub = env.BUDGET.get(env.BUDGET.idFromName("global"));
  const day = utcDay(now);
  return {
    async reserve(neurons: number): Promise<Reserved> {
      const response = await stub.fetch(`https://budget/reserve?day=${day}&neurons=${neurons}`, { method: "POST" });
      return (await response.json()) as Reserved;
    },
    async settle(delta: number): Promise<void> {
      await stub.fetch(`https://budget/settle?day=${day}&delta=${delta}`, { method: "POST" });
    },
    async today(): Promise<Response> {
      const spent = (await (await stub.fetch(`https://budget/peek?day=${day}`)).json()) as { calls: number; neurons: number };
      return json({ day, ...spent, callCap: CALL_CAP, neuronCap: NEURON_CAP });
    },
  };
}

async function run(env: Env, target: Target, now: number): Promise<Response> {
  const budget = budgetOf(env, now);
  const reserved = await budget.reserve(target.neurons);
  if (!reserved.ok) {
    const message = `The proxy's daily ${reserved.spent === "calls" ? "call" : "neuron"} budget is spent; it resets at 00:00 UTC.`;
    return json({ code: "daily_budget_spent", message }, 429);
  }
  let result: unknown;
  try {
    result = await env.AI.run(target.model, target.input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "upstream error";
    const status = /balance|credits|402|2021/iu.test(message) ? 402 : 502;
    return json({ code: status === 402 ? "insufficient_credits" : "upstream_error", message }, status);
  }
  const cost = target.neurons > 0 ? measured(result) : null;
  if (cost !== null && cost !== target.neurons) await budget.settle(cost - target.neurons);
  return json(result);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const budgetRead = request.method === "GET" && new URL(request.url).pathname === "/v1/budget";
    if (request.method !== "POST" && !budgetRead) return json({ code: "method_not_allowed" }, 405);
    if (!(await authorized(request, env))) return json({ code: "unauthorized" }, 401);
    if (budgetRead) return budgetOf(env, Date.now()).today();
    const read = await readBody(request);
    if (!read) return json({ code: "invalid_json" }, 400);
    const target = route(new URL(request.url).pathname, read.body, read.bytes);
    if (!target) return json({ code: "not_found" }, 404);
    return run(env, target, Date.now());
  },
};
