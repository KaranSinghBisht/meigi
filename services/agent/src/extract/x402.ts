import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import type { X402Details } from "./types.js";

/**
 * x402 402-responses: `{ x402Version, accepts: [{ scheme, network, maxAmountRequired | amount, payTo, asset,
 * resource, ... }] }` (v2 moves `resource` to the top level). `payTo` is an unauthenticated field chosen by
 * the server, which is exactly why it gets the same registry check as an invoice address.
 * Only a document that *is* a 402 body counts (optionally after an HTTP status line and headers): JSON
 * hidden inside an invoice must never replace the invoice's printed amount or number.
 */

const atomic = z.union([z.string().regex(/^\d{1,78}$/u), z.number().int().nonnegative().refine(Number.isSafeInteger)]);

const requirement = z.object({
  scheme: z.string().max(64).optional(),
  network: z.union([z.string().max(64), z.number()]).optional(),
  maxAmountRequired: atomic.optional(),
  amount: atomic.optional(),
  payTo: z.string().max(80).optional(),
  asset: z.string().max(80).optional(),
  resource: z.string().optional(),
});

const response = z.object({
  x402Version: z.number().optional(),
  accepts: z.array(requirement).min(1),
  resource: z.union([z.string(), z.object({ url: z.string().optional() })]).optional(),
});

/** The first payment requirement when the whole document is an x402 402-response, else null. */
export function parseX402(text: string): X402Details | null {
  const body = responseBody(text);
  if (body === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null; // looks like JSON but isn't: an ordinary document
  }
  const parsed = response.safeParse(json);
  if (!parsed.success) return null;
  const req = parsed.data.accepts[0]!;
  const topResource = parsed.data.resource;
  const amount = req.maxAmountRequired ?? req.amount;
  return {
    resource: urlOrNull(req.resource ?? (typeof topResource === "string" ? topResource : topResource?.url)),
    payTo: addressOrNull(req.payTo),
    amountAtomic: amount === undefined ? null : String(amount),
    asset: addressOrNull(req.asset),
    network: req.network === undefined ? null : String(req.network),
    scheme: req.scheme ?? null,
  };
}

/** The JSON body: the whole trimmed text, or what follows "HTTP/1.1 402 ..." and header lines. */
function responseBody(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed.endsWith("}") ? trimmed : null;
  const lines = trimmed.split("\n");
  if (!/^HTTP\/\d(?:\.\d)?\s+402\b/u.test(lines[0] ?? "")) return null;
  const blank = lines.findIndex((line) => line.trim() === "");
  if (blank === -1 || !lines.slice(1, blank).every((line) => /^[A-Za-z0-9-]{1,64}:/u.test(line))) return null;
  const body = lines.slice(blank + 1).join("\n").trim();
  return body.startsWith("{") && body.endsWith("}") ? body : null;
}

/** The resource becomes part of the invoice reference, so only a plain URL (printable ASCII, no spaces) is kept. */
function urlOrNull(value: string | undefined): string | null {
  return value && /^https?:\/\/[\x21-\x7E]{1,200}$/u.test(value) ? value : null;
}

function addressOrNull(value: string | undefined): Address | null {
  return value && isAddress(value, { strict: false }) ? getAddress(value.toLowerCase()) : null;
}
