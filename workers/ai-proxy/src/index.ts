/**
 * Meigi AI proxy (Cloudflare Worker). One authenticated endpoint per model family:
 *   POST /v1/systemone  → TypeSafe Jev (System-1 typed decisions), billed via AI Gateway credits
 *   POST /v1/chat       → Workers AI Llama (proposals and explanations), free tier
 * Every request needs `Authorization: Bearer <PROXY_TOKEN>` (a Worker secret).
 */

interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

interface Env {
  AI: AiBinding;
  PROXY_TOKEN: string;
}

/** Workers extends SubtleCrypto with a constant-time comparison. */
type WorkersSubtle = SubtleCrypto & { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean };

const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_BODY_BYTES = 64 * 1024;

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

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Only forwards the fields each model takes, so callers can't smuggle other options through. */
function route(pathname: string, body: Record<string, unknown>): { model: string; input: unknown } | null {
  if (pathname === "/v1/systemone") {
    return { model: "typesafe/jev", input: { state: body.state, questions: body.questions } };
  }
  if (pathname === "/v1/chat") {
    const maxTokens = typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 1024) : 512;
    return { model: CHAT_MODEL, input: { messages: body.messages, max_tokens: maxTokens, temperature: body.temperature } };
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405);
    if (!(await authorized(request, env))) return json({ code: "unauthorized" }, 401);
    const body = await readBody(request);
    if (!body) return json({ code: "invalid_json" }, 400);
    const target = route(new URL(request.url).pathname, body);
    if (!target) return json({ code: "not_found" }, 404);
    try {
      return json(await env.AI.run(target.model, target.input));
    } catch (error) {
      const message = error instanceof Error ? error.message : "upstream error";
      const status = /balance|credits|402|2021/iu.test(message) ? 402 : 502;
      return json({ code: status === 402 ? "insufficient_credits" : "upstream_error", message }, status);
    }
  },
};
