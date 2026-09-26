import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { createAnthropicLlm } from "../src/llm/anthropic.js";
import { EXPLAIN_SYSTEM } from "../src/llm/prompts.js";
import { LlmError, type ExplanationFacts, type Proposal } from "../src/llm/types.js";
import { createWorkersAiLlm } from "../src/llm/workers-ai.js";
import { LOOKALIKE } from "./fakes.js";

const proposal: Proposal = {
  tNumber: "T2011001234567",
  payTo: LOOKALIKE,
  amount: "88000",
  invoiceNumber: "MS-2026-1010",
  wouldPay: true,
  reasoning: "The note says the wallet was migrated and the CFO approved it.",
};

const facts: ExplanationFacts = {
  decision: "reverted",
  payee: { tNumber: "T2011001234567", legalName: "株式会社メイギ商事", registeredPayout: "0xa1c4Da602D3048DD7D0E9A8E1cf5a90419945C3b" },
  payment: { payTo: LOOKALIKE, amount: "¥88,000" },
  reasons: [{ code: "payout_mismatch", message: "..." }],
  revert: { name: "PayeeMismatch", sentence: "...", broadcast: false },
};

/** A Messages API reply, as the Anthropic SDK receives it over fetch. */
function messageReply(text: string, stopReason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function anthropicWith(status: number, body: unknown) {
  const requests: Record<string, any>[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_1" } });
  }) as unknown as typeof fetch;
  const client = new Anthropic({ apiKey: "sk-test", fetch: fetchImpl, maxRetries: 0 });
  return { llm: createAnthropicLlm({ apiKey: "sk-test", model: "claude-haiku-4-5", client }), requests };
}

describe("Anthropic provider", () => {
  it("asks Claude Haiku for a structured proposal and validates it", async () => {
    const { llm, requests } = anthropicWith(200, messageReply(JSON.stringify(proposal)));
    expect(await llm.propose("請求書")).toEqual(proposal);
    expect(requests[0]).toMatchObject({ model: "claude-haiku-4-5", output_config: { format: { type: "json_schema" } } });
    expect(requests[0]?.messages[0].content).toContain("<document>\n請求書\n</document>");
  });

  it("writes explanations from facts only", async () => {
    const { llm, requests } = anthropicWith(200, messageReply("The chain refused it."));
    expect(await llm.explain(facts)).toBe("The chain refused it.");
    expect(JSON.parse(requests[0]?.messages[0].content)).toEqual(facts);
    expect(requests[0]?.output_config).toBeUndefined();
  });

  it("maps API errors to LlmError", async () => {
    const { llm } = anthropicWith(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    await expect(llm.propose("x")).rejects.toMatchObject({ name: "LlmError", code: "unauthorized" });
  });
});

describe("Workers AI provider", () => {
  function workersWith(reply: unknown, status = 200) {
    const requests: { url: string; body: Record<string, any>; auth: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization! });
      return new Response(JSON.stringify(reply), { status });
    }) as unknown as typeof fetch;
    const url = "https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    return { llm: createWorkersAiLlm({ url, token: "cf", model: "llama", fetch: fetchImpl }), requests };
  }

  it("reads JSON mode (an object in the Cloudflare envelope)", async () => {
    const { llm, requests } = workersWith({ success: true, result: { response: proposal } });
    expect(await llm.propose("請求書")).toEqual(proposal);
    expect(requests[0]?.auth).toBe("Bearer cf");
    expect(requests[0]?.body.response_format.type).toBe("json_schema");
    expect(requests[0]?.body.response_format.json_schema.$schema).toBeUndefined();
  });

  it("reads the team proxy's OpenAI-style reply", async () => {
    const { llm } = workersWith({ choices: [{ message: { role: "assistant", content: `\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\`` } }] });
    expect(await llm.propose("請求書")).toEqual(proposal);
    expect(await workersWith({ choices: [{ message: { content: " Held. " } }] }).llm.explain(facts)).toBe("Held.");
  });

  it("accepts a JSON object inside a text reply (proxies without JSON mode)", async () => {
    const { llm } = workersWith({ response: `Here you go:\n${JSON.stringify(proposal)}` });
    expect(await llm.propose("請求書")).toEqual(proposal);
  });

  it("returns explanations and maps failures", async () => {
    expect(await workersWith({ result: { response: " Held. " } }).llm.explain(facts)).toBe("Held.");
    await expect(workersWith({ result: { response: "no json here" } }).llm.propose("x")).rejects.toBeInstanceOf(LlmError);
    await expect(workersWith({ errors: [] }, 500).llm.explain(facts)).rejects.toMatchObject({ code: "http_500" });
  });
});

describe("the explanation prompt", () => {
  it("never lets a refusal in simulation be called on-chain", () => {
    expect(EXPLAIN_SYSTEM).toContain("held, refused by the vault, or paid");
    expect(EXPLAIN_SYSTEM).toContain('"broadcast": false');
    expect(EXPLAIN_SYSTEM).toContain("(in simulation; nothing was sent)");
    expect(EXPLAIN_SYSTEM).not.toContain("refused on-chain or paid");
  });
});
