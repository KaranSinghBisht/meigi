import { z } from "zod";
import { EXPLAIN_SYSTEM, explainMessage, PROPOSAL_SYSTEM, proposalMessage } from "./prompts.js";
import { LlmError, ProposalSchema, type LlmPort, type Proposal } from "./types.js";

export interface WorkersAiOptions {
  provider?: "workers-ai" | "proxy";
  url: string; // Cloudflare REST .../ai/run/<model>, or the team proxy's /v1/chat (workers/ai-proxy)
  token: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

// Workers AI JSON mode takes a plain JSON Schema; it rejects the `$schema` keyword.
const { $schema: _dialect, ...PROPOSAL_JSON_SCHEMA } = z.toJSONSchema(ProposalSchema);

/** Llama 3.3 70B on Workers AI. JSON mode is requested; plain text containing a JSON object is accepted too. */
export function createWorkersAiLlm(opts: WorkersAiOptions): LlmPort {
  return {
    provider: opts.provider ?? "workers-ai",
    model: opts.model,
    async propose(document: string): Promise<Proposal> {
      const output = await run(opts, {
        messages: [
          { role: "system", content: PROPOSAL_SYSTEM },
          { role: "user", content: `${proposalMessage(document)}\n\nReply with only a JSON object with those keys.` },
        ],
        max_tokens: 700,
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: PROPOSAL_JSON_SCHEMA },
      });
      const parsed = ProposalSchema.safeParse(typeof output === "string" ? jsonObjectIn(output) : output);
      if (!parsed.success) throw new LlmError("unparseable", "Workers AI returned no usable proposal");
      return parsed.data;
    },
    async explain(facts): Promise<string> {
      const output = await run(opts, {
        messages: [
          { role: "system", content: EXPLAIN_SYSTEM },
          { role: "user", content: explainMessage(facts) },
        ],
        max_tokens: 300,
        temperature: 0.2,
      });
      if (typeof output !== "string" || !output.trim()) throw new LlmError("empty", "Workers AI returned no explanation");
      return output.trim();
    },
  };
}

/** POSTs to Workers AI and returns the reply: Cloudflare's `{ result: { response } }`, a bare `{ response }`,
 *  or the OpenAI-style `{ choices: [{ message: { content } }] }` the team proxy returns. */
async function run(opts: WorkersAiOptions, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await (opts.fetch ?? fetch)(opts.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new LlmError(timedOut ? "timeout" : "unreachable", timedOut ? "Workers AI did not answer in time" : "could not reach Workers AI");
  }
  if (!response.ok) throw new LlmError(`http_${response.status}`, `Workers AI returned ${response.status}`);
  const json = (await response.json().catch(() => null)) as WorkersAiReply | null;
  const output = json?.result?.response ?? json?.response ?? json?.choices?.[0]?.message?.content;
  if (output === undefined || output === null) throw new LlmError("bad_response", "Workers AI returned no response field");
  return output;
}

interface WorkersAiReply {
  result?: { response?: unknown };
  response?: unknown;
  choices?: { message?: { content?: unknown } }[];
}

/** The outermost `{...}` in a text reply, parsed; null when there is none. */
function jsonObjectIn(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null; // the schema check that follows reports it as unparseable
  }
}
