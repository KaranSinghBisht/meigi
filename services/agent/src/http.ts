import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { BaseError } from "viem";
import { ZodError } from "zod";
import { ConfigMismatchError } from "./chain/reader.js";

/** An error that is safe to show to the caller: a stable code plus a human-readable message. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Maps errors to JSON responses without leaking stack traces, RPC URLs or keys. */
export function handleError(error: Error, c: Context) {
  if (error instanceof HttpError) {
    return c.json({ code: error.code, message: error.message }, error.status);
  }
  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => issue.path.join(".") || "body");
    return c.json({ code: "invalid_input", message: `invalid fields: ${fields.join(", ")}` }, 400);
  }
  if (error instanceof ConfigMismatchError) {
    process.stderr.write(`[agent] ${error.message}\n`);
    return c.json({ code: "config_mismatch", message: error.message }, 500);
  }
  if (error instanceof BaseError) {
    // viem errors can embed the RPC URL (and any API key in it): log the short form only.
    process.stderr.write(`[agent] chain error: ${error.name}: ${error.shortMessage}\n`);
    return c.json({ code: "chain_error", message: chainMessage(error) }, 502);
  }
  process.stderr.write(`[agent] unexpected error: ${error.name}: ${error.message}\n`);
  return c.json({ code: "internal_error", message: "something went wrong" }, 500);
}

function chainMessage(error: BaseError): string {
  if (error.walk((e) => (e as Error).name === "InsufficientFundsError")) {
    return "the agent key has no ETH to pay for gas";
  }
  if (error.walk((e) => (e as Error).name === "WaitForTransactionReceiptTimeoutError")) {
    return "the transaction was sent but not confirmed in time; check the explorer before retrying";
  }
  return "the chain request failed; try again";
}

/** When AGENT_API_TOKEN is set, every POST (analyze and pay) needs it as a bearer token. */
export function requireToken(token: string): MiddlewareHandler {
  const expected = Buffer.from(`Bearer ${token}`);
  return async (c, next) => {
    if (c.req.method === "POST") {
      const given = Buffer.from(c.req.header("authorization") ?? "");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw new HttpError(401, "unauthorized", "a valid bearer token is required");
      }
    }
    await next();
  };
}

/**
 * Parses a JSON body; an empty body counts as `{}` and malformed JSON is a 400, not a 500. POSTs must say
 * application/json: a cross-site form can't send that without a CORS preflight, which APP_ORIGINS gates.
 */
export async function readJson(c: Context): Promise<unknown> {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "send the body as application/json");
  }
  const text = await c.req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "the body is not valid JSON");
  }
}
