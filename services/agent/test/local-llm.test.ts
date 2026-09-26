import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createLocalLlm } from "../src/llm/local.js";
import { LlmError } from "../src/llm/types.js";

/** A stub OpenAI-compatible server (what Ollama serves at /v1): each test sets the next reply. */
let server: Server;
let base: string;
let reply: { status: number; body: unknown; delayMs?: number } = { status: 200, body: {} };
const seen: { path: string; headers: IncomingMessage["headers"]; body: Record<string, any> }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", headers: req.headers, body: JSON.parse(raw || "{}") });
      const send = () => res.writeHead(reply.status, { "content-type": "application/json" }).end(JSON.stringify(reply.body));
      if (reply.delayMs) setTimeout(send, reply.delayMs);
      else send();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const chatReply = (content: string) => ({ status: 200, body: { choices: [{ message: { role: "assistant", content } }] } });
const proposal = { tNumber: "T2011001234567", payTo: "0xdCa52b5FA181a3307eCa852935BD40e3E0096d5b", amount: "132000", invoiceNumber: "MS-2026-0917", wouldPay: true, reasoning: "The email says the account changed." };
const llm = (timeoutMs = 2_000) => createLocalLlm({ url: base, model: "llama3.1:8b", timeoutMs });

describe("local LLM provider (OpenAI-compatible, e.g. Ollama)", () => {
  it("asks for a JSON object and parses the proposal", async () => {
    reply = chatReply(JSON.stringify(proposal));
    expect(await llm().propose("請求書 …")).toEqual(proposal);
    const request = seen.at(-1)!;
    expect(request.path).toBe("/v1/chat/completions");
    expect(request.headers.authorization).toBeUndefined();
    expect(request.body).toMatchObject({ model: "llama3.1:8b", stream: false, reasoning_effort: "none", response_format: { type: "json_object" } });
    expect(request.body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
  });

  it("finds the JSON object inside prose", async () => {
    reply = chatReply(`Sure! Here is my proposal:\n${JSON.stringify(proposal)}\nLet me know.`);
    expect(await llm().propose("…")).toEqual(proposal);
  });

  it("reports a timeout", async () => {
    reply = { ...chatReply(JSON.stringify(proposal)), delayMs: 500 };
    await expect(llm(100).propose("…")).rejects.toMatchObject({ name: "LlmError", code: "timeout", message: "the local model did not answer in time" });
  });

  it("reports a 500 without echoing the body", async () => {
    reply = { status: 500, body: { error: "model crashed: stack trace here" } };
    const error = await llm().propose("…").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ code: "http_500", message: "the local model returned 500" });
  });

  it("reports a reply that isn't a proposal, and a server that isn't there", async () => {
    reply = chatReply("I can't help with that.");
    await expect(llm().propose("…")).rejects.toMatchObject({ code: "unparseable" });
    const gone = createLocalLlm({ url: "http://127.0.0.1:9/v1", model: "m", timeoutMs: 1_000 });
    await expect(gone.propose("…")).rejects.toMatchObject({ code: "unreachable" });
  });

  it("writes the explanation as plain text, without JSON mode", async () => {
    reply = chatReply("  The payment is held because the address is not the registered one.  ");
    const facts = { decision: "hold" as const, payee: { tNumber: "T2011001234567", legalName: null, registeredPayout: null }, payment: { payTo: null, amount: null }, reasons: [], revert: null };
    expect(await llm().explain(facts)).toBe("The payment is held because the address is not the registered one.");
    expect(seen.at(-1)!.body.response_format).toBeUndefined();
  });

  it("is the default provider, and allows http only on loopback", () => {
    const env = { SEPOLIA_RPC_URL: "http://127.0.0.1:8547", AGENT_ADDRESS: `0x${"11".repeat(20)}`, SIGNER_TOKEN: "s".repeat(64), REGISTRY_ADDRESS: `0x${"22".repeat(20)}`, VAULT_ADDRESS: `0x${"33".repeat(20)}` };
    expect(loadConfig(env)).toMatchObject({ LLM_PROVIDER: "local", LOCAL_LLM_URL: "http://127.0.0.1:11434/v1", LOCAL_LLM_MODEL: "llama3.1:8b" });
    expect(loadConfig({ ...env, LOCAL_LLM_URL: "https://llm.example.com/v1/" }).LOCAL_LLM_URL).toBe("https://llm.example.com/v1");
    expect(() => loadConfig({ ...env, LOCAL_LLM_URL: "http://192.168.1.20:11434/v1" })).toThrow("LOCAL_LLM_URL");
    expect(() => loadConfig({ ...env, LOCAL_LLM_URL: "not a url" })).toThrow("LOCAL_LLM_URL");
  });

  it("holds every model URL that can carry a token or a document to https, or http on loopback", () => {
    const env = { SEPOLIA_RPC_URL: "http://127.0.0.1:8547", AGENT_ADDRESS: `0x${"11".repeat(20)}`, SIGNER_TOKEN: "s".repeat(64), REGISTRY_ADDRESS: `0x${"22".repeat(20)}`, VAULT_ADDRESS: `0x${"33".repeat(20)}` };
    expect(loadConfig(env)).toMatchObject({ TRIAGE_BACKENDS: "systemone", SYSTEMONE_URL: "http://127.0.0.1:8102/v1/systemone" }); // local only by default
    for (const name of ["SYSTEMONE_URL", "AI_PROXY_URL", "WORKERS_AI_URL"]) {
      expect(() => loadConfig({ ...env, [name]: "http://proxy.example.com/v1" })).toThrow(name);
      expect(() => loadConfig({ ...env, [name]: "https://proxy.example.com" })).not.toThrow();
    }
  });
});
