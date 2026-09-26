import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { BaseError } from "viem";
import { ZodError } from "zod";
import { ConfigMismatchError } from "./chain/reader.js";
import { SignerUnavailable } from "./chain/remote-payer.js";

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
  if (error instanceof SignerUnavailable) {
    process.stderr.write(`[agent] ${error.message}\n`);
    return c.json({ code: "signer_unavailable", message: signerMessage(error) }, 503);
  }
  if (error instanceof BaseError) {
    // viem errors can embed the RPC URL (and any API key in it): log the short form only.
    process.stderr.write(`[agent] chain error: ${error.name}: ${error.shortMessage}\n`);
    return c.json({ code: "chain_error", message: chainMessage(error) }, 502);
  }
  process.stderr.write(`[agent] unexpected error: ${error.name}: ${error.message}\n`);
  return c.json({ code: "internal_error", message: "something went wrong" }, 500);
}

/** What went wrong at the signer, from what it answered (null: nothing answered at all). */
function signerTrouble(status: number | null): string {
  if (status === null) return "The signer isn't answering";
  if (status === 401) return "The signer refused the agent's token (SIGNER_TOKEN must be the same in .env and .env.signer)";
  if (status === 502) return "The signer couldn't reach the chain";
  return status === 200 ? "The signer's answer couldn't be read" : `The signer answered ${status}`;
}

/**
 * The agent holds no key, so without the signer it can't pay. Only a failure at /simulate proves nothing was sent; a
 * transaction already sent only needs its receipt read, which a plain Pay does. A verified human's approval that went
 * with an attempt that sent nothing known is spent, so paying again needs a new one.
 */
function signerMessage({ status, nothingSent, sentTx, approval }: SignerUnavailable): string {
  const stopped = status === null ? "The signer stopped answering" : signerTrouble(status);
  if (sentTx) {
    const again = approval === "not_needed" ? " No new approval is needed." : "";
    return `${stopped}, but the payment was sent (tx ${sentTx}): press Pay once it answers to read its receipt.${again}`;
  }
  const spent = approval === "spent";
  if (nothingSent) {
    const renew = spent ? " The approval is used up: ask for a new one once the signer is back." : "";
    return `${signerTrouble(status)}, and the agent holds no key of its own: nothing was signed or sent.${renew}`;
  }
  const again = spent ? "Once it answers, pay again with a new approval (this one is used up)" : "Pay again once it answers";
  return `${stopped} during the payment, so it may have been sent. ${again}: the vault refuses a second payment of this invoice.`;
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

/**
 * Answers only requests addressed to this machine by name (localhost, 127.0.0.1, [::1], with or without the port),
 * or to a name in AGENT_ALLOWED_HOSTS. A DNS-rebinding page reaches 127.0.0.1 under its own host name, so it gets a
 * 403 before any route runs. Both the Host header and the request URL are checked.
 */
export function requireHost(allowed: readonly string[]): MiddlewareHandler {
  const hosts = new Set(allowed.map((host) => host.toLowerCase()));
  return async (c, next) => {
    const named = [c.req.header("host"), new URL(c.req.url).host].filter((host): host is string => Boolean(host));
    if (named.length === 0 || !named.every((host) => hosts.has(host.toLowerCase()))) {
      throw new HttpError(403, "forbidden_host", "this agent answers only on localhost");
    }
    await next();
  };
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
