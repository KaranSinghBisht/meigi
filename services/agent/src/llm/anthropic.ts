import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EXPLAIN_SYSTEM, explainMessage, PROPOSAL_SYSTEM, proposalMessage } from "./prompts.js";
import { LlmError, ProposalSchema, type LlmPort, type Proposal } from "./types.js";

export interface AnthropicOptions {
  apiKey: string;
  model: string; // claude-haiku-4-5 by default
  client?: Anthropic; // injectable for tests
}

/** Claude as the agent: a structured-output proposal (validated against ProposalSchema) and plain-text explanations. */
export function createAnthropicLlm(opts: AnthropicOptions): LlmPort {
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: 30_000, maxRetries: 1 });
  return {
    provider: "anthropic",
    model: opts.model,
    async propose(document: string): Promise<Proposal> {
      const response = await call(() =>
        client.messages.parse({
          model: opts.model,
          max_tokens: 1024,
          system: PROPOSAL_SYSTEM,
          messages: [{ role: "user", content: proposalMessage(document) }],
          output_config: { format: zodOutputFormat(ProposalSchema) },
        }),
      );
      if (response.stop_reason === "refusal") throw new LlmError("refused", "the model declined to read this document");
      if (!response.parsed_output) throw new LlmError("unparseable", "the model returned no structured proposal");
      return response.parsed_output;
    },
    async explain(facts): Promise<string> {
      const response = await call(() =>
        client.messages.create({
          model: opts.model,
          max_tokens: 400,
          system: EXPLAIN_SYSTEM,
          messages: [{ role: "user", content: explainMessage(facts) }],
        }),
      );
      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
      if (!text) throw new LlmError("empty", "the model returned no explanation");
      return text;
    },
  };
}

/** Maps SDK errors (most specific first) to LlmError; anything else is a bug and propagates. */
async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new LlmError("unauthorized", "the Anthropic API key was rejected");
    if (error instanceof Anthropic.RateLimitError) throw new LlmError("rate_limited", "Anthropic rate limit reached");
    if (error instanceof Anthropic.APIConnectionTimeoutError) throw new LlmError("timeout", "Anthropic did not answer in time");
    if (error instanceof Anthropic.APIConnectionError) throw new LlmError("unreachable", "could not reach Anthropic");
    if (error instanceof Anthropic.APIError) throw new LlmError(`http_${error.status ?? "error"}`, `Anthropic returned ${error.status}`);
    throw error;
  }
}
