/**
 * The proxy's daily budget, so Workers AI can't run up a bill on the paid plan. Per UTC day it allows at most
 * CALL_CAP calls and NEURON_CAP neurons, well inside the account's 10,000 free neurons a day. The site's
 * "Ask the ledger" shares that allocation with its own cap.
 * - Neurons are Llama's, estimated from tokens at Cloudflare's published rates. Every chat call reserves its worst
 *   case first: every body byte an input token, plus max_tokens out. It then settles to the usage Workers AI
 *   reports; a call that fails keeps its reservation.
 * - Jev (/v1/systemone) spends prepaid AI Gateway credits, not neurons, so it counts towards the calls only.
 * - One SQLite-backed Durable Object holds the counters. It handles one event at a time, so a reservation can't race.
 */

export const CALL_CAP = 200;
export const NEURON_CAP = 6_000;
// @cf/meta/llama-3.3-70b-instruct-fp8-fast: 26,668 neurons per million input tokens, 204,805 per million output.
const NEURONS_PER_INPUT_TOKEN = 26_668 / 1_000_000;
const NEURONS_PER_OUTPUT_TOKEN = 204_805 / 1_000_000;

/** The most a chat call can cost: every body byte an input token, and every allowed output token used. */
export function worstCase(bodyBytes: number, maxTokens: number): number {
  return Math.ceil(bodyBytes * NEURONS_PER_INPUT_TOKEN + maxTokens * NEURONS_PER_OUTPUT_TOKEN);
}

/** What a chat call cost: the neurons Workers AI reports, else its tokens at the rates above; null without usage. */
export function measured(result: unknown): number | null {
  const usage = result && typeof result === "object" ? (result as { usage?: unknown }).usage : undefined;
  if (!usage || typeof usage !== "object") return null;
  const { neurons, prompt_tokens: input, completion_tokens: output } = usage as Record<string, unknown>;
  if (typeof neurons === "number" && Number.isFinite(neurons) && neurons >= 0) return Math.ceil(neurons);
  if (typeof input !== "number" || typeof output !== "number" || input < 0 || output < 0) return null;
  return Math.ceil(input * NEURONS_PER_INPUT_TOKEN + output * NEURONS_PER_OUTPUT_TOKEN);
}

/** Today in UTC: the counters' key, so a new day starts empty. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export interface BudgetStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
}

interface Day {
  readonly day: string;
  readonly calls: number;
  readonly neurons: number;
}

export type Reserved = { readonly ok: true } | { readonly ok: false; readonly spent: "calls" | "neurons" };

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const KEY = "today";
const whole = (value: string | null) => (value !== null && /^-?\d{1,9}$/u.test(value) ? Number(value) : null);

/**
 * The counters, as a Durable Object:
 * - POST /reserve?day=&neurons= counts one call and holds `neurons` for it;
 * - POST /settle?day=&delta= corrects the neurons once the cost is known;
 * - GET /peek?day= reads them.
 */
export class ProxyBudget {
  private readonly storage: BudgetStorage;

  constructor(state: { storage: BudgetStorage }) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const day = url.searchParams.get("day") ?? "";
    if (!DAY.test(day)) return new Response(null, { status: 400 });
    const stored = await this.storage.get<Day>(KEY);
    const today: Day = stored?.day === day ? stored : { day, calls: 0, neurons: 0 };
    if (url.pathname === "/peek") return Response.json({ calls: today.calls, neurons: today.neurons });
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (url.pathname === "/reserve") return this.reserve(today, whole(url.searchParams.get("neurons")));
    if (url.pathname === "/settle") return this.settle(today, whole(url.searchParams.get("delta")));
    return new Response(null, { status: 404 });
  }

  private async reserve(today: Day, neurons: number | null): Promise<Response> {
    if (neurons === null || neurons < 0) return new Response(null, { status: 400 });
    if (today.calls >= CALL_CAP) return Response.json({ ok: false, spent: "calls" } satisfies Reserved);
    if (today.neurons + neurons > NEURON_CAP) return Response.json({ ok: false, spent: "neurons" } satisfies Reserved);
    await this.storage.put(KEY, { ...today, calls: today.calls + 1, neurons: today.neurons + neurons });
    return Response.json({ ok: true } satisfies Reserved);
  }

  private async settle(today: Day, delta: number | null): Promise<Response> {
    if (delta === null) return new Response(null, { status: 400 });
    await this.storage.put(KEY, { ...today, neurons: Math.max(0, today.neurons + delta) });
    return Response.json({ ok: true });
  }
}
