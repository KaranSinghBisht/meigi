import { EXPLAIN_SYSTEM, explainMessage, PROPOSAL_SYSTEM, proposalMessage } from "./prompts.js";
import { LlmError, ProposalSchema, type LlmPort, type Proposal } from "./types.js";
import { jsonObjectIn } from "./workers-ai.js";

export interface LocalLlmOptions {
  url: string; // an OpenAI-compatible base URL, e.g. Ollama's http://127.0.0.1:11434/v1
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Message = { role: "system" | "user"; content: string };

/**
 * A model on this machine behind an OpenAI-compatible chat API (Ollama with gemma4:e4b by default, as the booth runs it). No key.
 * JSON mode is requested for the proposal; a reply with a JSON object inside prose is accepted too. Thinking is
 * switched off (`reasoning_effort: "none"`): a thinking model (gemma4) otherwise spends the whole token budget
 * reasoning and returns empty content. Ollama ignores it for models that don't think.
 */
export function createLocalLlm(opts: LocalLlmOptions): LlmPort {
  return {
    provider: "local",
    model: opts.model,
    async propose(document: string): Promise<Proposal> {
      const content = await chat(opts, [
        { role: "system", content: PROPOSAL_SYSTEM },
        { role: "user", content: `${proposalMessage(document)}\n\nReply with only a JSON object with those keys.` },
      ], { max_tokens: 700, response_format: { type: "json_object" } });
      const parsed = ProposalSchema.safeParse(jsonObjectIn(content));
      if (!parsed.success) throw new LlmError("unparseable", "the local model returned no usable proposal");
      return parsed.data;
    },
    async explain(facts): Promise<string> {
      const content = await chat(opts, [
        { role: "system", content: EXPLAIN_SYSTEM },
        { role: "user", content: explainMessage(facts) },
      ], { max_tokens: 300 });
      if (!content.trim()) throw new LlmError("empty", "the local model returned no explanation");
      return content.trim();
    },
  };
}

/** POST {url}/chat/completions and return `choices[0].message.content`. */
async function chat(opts: LocalLlmOptions, messages: Message[], params: Record<string, unknown>): Promise<string> {
  let response: Response;
  try {
    response = await (opts.fetch ?? fetch)(`${opts.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: opts.model, messages, temperature: 0.2, stream: false, reasoning_effort: "none", ...params }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new LlmError(timedOut ? "timeout" : "unreachable", timedOut ? "the local model did not answer in time" : "could not reach the local model");
  }
  if (!response.ok) throw new LlmError(`http_${response.status}`, `the local model returned ${response.status}`);
  const json = (await response.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new LlmError("bad_response", "the local model returned no message");
  return content;
}
