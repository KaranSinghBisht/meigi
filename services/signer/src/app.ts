import { createHash, timingSafeEqual } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Address, Hex } from "viem";
import { z } from "zod";
import type { PayCall, SignerPayer } from "./payer.js";
import { approvalRefusal, type Policy } from "./policy.js";

/**
 * The signer's HTTP API, for the AP agent on localhost only. Typed fields in, never calldata: the signer builds
 * `AgentVault.payInvoice` itself. Every route but /health needs `Authorization: Bearer <SIGNER_TOKEN>`. Each answer
 * names the signing key (`signer`) and what the signer's own simulation returned, for the agent's audit log.
 */

export interface SignerInfo {
  agent: Address;
  vault: Address;
  chainId: number;
  humanAboveYen: number;
}

export interface SignerDeps {
  payer: SignerPayer;
  policy: Policy;
  token: string;
  info: SignerInfo;
}

const call = z
  .object({
    tNumber: z.string().regex(/^\d{13}$/u),
    payout: z.string().regex(/^0x[0-9a-fA-F]{40}$/u),
    amount: z.string().regex(/^\d{1,78}$/u),
    invoiceRef: z.string().regex(/^0x[0-9a-fA-F]{64}$/u),
  })
  .strict();
const pay = call.extend({ approval: z.object({ idToken: z.string().min(1).max(16_384) }).strict().optional() }).strict();

function payCall(body: z.infer<typeof call>): PayCall {
  return { tNumber: BigInt(body.tNumber), expectedPayout: body.payout as Address, amount: BigInt(body.amount), invoiceRef: body.invoiceRef as Hex };
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compares digests, so neither the token's length nor its bytes leak through timing. */
function authorized(header: string | undefined, token: string): boolean {
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(digest(presented), digest(token));
}

export function createSignerApp(deps: SignerDeps) {
  const app = new Hono();
  app.use("*", bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ code: "too_large", message: "The request body is too large." }, 413) }));
  app.get("/health", (c) => c.json({ ok: true, ...deps.info }));
  app.use("*", async (c, next) => {
    if (!authorized(c.req.header("authorization"), deps.token)) return c.json({ code: "unauthorized", message: "A valid signer token is required." }, 401);
    return next();
  });

  app.post("/simulate", async (c) => {
    const body = await parse(c, call);
    if (!body) return invalid(c);
    const simulated = await deps.payer.simulate(payCall(body));
    const signer = deps.info.agent;
    return c.json(simulated.ok ? { ok: true, payout: simulated.payout, signer } : { ok: false, revert: simulated.revert, signer });
  });

  app.post("/pay", async (c) => {
    const body = await parse(c, pay);
    if (!body) return invalid(c);
    const signer = deps.info.agent;
    const refusal = approvalRefusal(BigInt(body.amount), body.approval, deps.policy);
    if (refusal) return c.json({ code: "human_approval_required", message: `The signer refused: ${refusal}.`, signer }, 403);
    const sent = await deps.payer.send(payCall(body));
    if (!sent.ok) return c.json({ ok: false, revert: sent.revert, signer }); // the in-lock simulation reverted
    const simulation = sent.payout ? { ok: true, payout: sent.payout } : null; // null: the tx already in flight
    return c.json({ ok: true, txHash: sent.txHash, signer, simulation });
  });

  app.get("/receipt/:txHash", async (c) => {
    const txHash = c.req.param("txHash");
    if (!/^0x[0-9a-fA-F]{64}$/u.test(txHash)) return invalid(c);
    const receipt = await deps.payer.receipt(txHash as Hex);
    return c.json({ receipt: receipt ? { ...receipt, blockNumber: receipt.blockNumber.toString() } : null });
  });

  app.onError((error, c) => {
    process.stderr.write(`[signer] ${c.req.method} ${c.req.path} failed: ${error instanceof Error ? error.name : "error"}\n`);
    return c.json({ code: "chain_unavailable", message: "The signer could not reach the chain." }, 502);
  });
  return app;
}

async function parse<T>(c: Context, schema: z.ZodType<T>): Promise<T | null> {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function invalid(c: Context) {
  return c.json({ code: "invalid_request", message: "Send the typed payInvoice fields: tNumber, payout, amount, invoiceRef." }, 400);
}
