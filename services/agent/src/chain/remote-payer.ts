import type { Address, Hex } from "viem";
import { z } from "zod";
import { decodeRaw } from "./revert.js";
import type { PayCall, PayerPort, PaymentReceipt, RawRevert, SendOutcome, Simulation } from "./types.js";

/**
 * The agent's side of services/signer: the process that alone holds the agent key. The agent sends typed
 * payInvoice fields and a bearer token over localhost; the signer simulates, applies its own ceiling, and signs.
 * A sent transaction is reported (onSent) as soon as the signer broadcasts it; its receipt is then polled.
 * Every exchange is reported to `observe` (the audit log): the signing key the signer named, and what its own
 * simulation returned. An approval token is only ever noted as present, never recorded.
 */

export class SignerUnavailable extends Error {
  override readonly name = "SignerUnavailable";
}

export interface SignerHealth {
  agent: Address;
  vault: Address;
  chainId: number;
  humanAboveYen: number;
}

export interface RemotePayer extends PayerPort {
  health(): Promise<SignerHealth>;
}

export type SignerEvent = "signer.simulate" | "signer.pay";

export interface RemotePayerOptions {
  url: string; // http://127.0.0.1:8796
  token: string; // SIGNER_TOKEN
  observe?: (event: SignerEvent, fields: Record<string, unknown>) => void;
  fetch?: typeof fetch;
  timeoutMs?: number;
  pollMs?: number;
  receiptTimeoutMs?: number;
  wait?: (ms: number) => Promise<void>;
}

const revert = z.union([z.object({ data: z.string().regex(/^0x[0-9a-fA-F]*$/u) }), z.object({ reason: z.string() }), z.object({ unknown: z.literal(true) })]);
const named = { signer: z.string().regex(/^0x[0-9a-fA-F]{40}$/u).optional() }; // the signing key, as the signer names it
const simulated = z.union([z.object({ ok: z.literal(true), payout: z.string(), ...named }), z.object({ ok: z.literal(false), revert, ...named })]);
const inLock = z.object({ ok: z.literal(true), payout: z.string() }).nullable().optional(); // null: a tx already in flight
const sent = z.union([z.object({ ok: z.literal(true), txHash: z.string(), simulation: inLock, ...named }), z.object({ ok: z.literal(false), revert, ...named })]);
const receipt = z.object({
  receipt: z.object({ txHash: z.string(), status: z.enum(["success", "reverted"]), blockNumber: z.string().regex(/^\d+$/u) }).nullable(),
});
const health = z.object({ agent: z.string(), vault: z.string(), chainId: z.number(), humanAboveYen: z.number() });
const refusal = z.object({ code: z.literal("human_approval_required"), message: z.string(), ...named });

function rawRevert(r: z.infer<typeof revert>): RawRevert {
  if ("data" in r) return decodeRaw(r.data as Hex);
  if ("reason" in r) return { name: "Error", inputs: [{ name: "reason", type: "string" }], args: [r.reason] };
  return { name: "UnknownRevert", inputs: [], args: [] };
}

function fields(call: PayCall) {
  return { tNumber: call.tNumber.toString(), payout: call.expectedPayout, amount: call.amount.toString(), invoiceRef: call.invoiceRef };
}

/** What an audit entry says about a call: the payInvoice fields, and whether a human's approval went with it. */
function about(call: PayCall, signer: string | undefined) {
  const tNumber = `T${call.tNumber.toString().padStart(13, "0")}`;
  return { signerId: signer ?? null, tNumber, invoiceRef: call.invoiceRef, payout: call.expectedPayout, amount: call.amount.toString(), approval: call.approval !== undefined };
}

export function createRemotePayer(opts: RemotePayerOptions): RemotePayer {
  const base = opts.url.replace(/\/+$/u, "");
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function request(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    let response: Response;
    try {
      response = await (opts.fetch ?? fetch)(`${base}${path}`, {
        method,
        redirect: "error",
        headers: { authorization: `Bearer ${opts.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
    } catch {
      throw new SignerUnavailable("the signer could not be reached");
    }
    return { status: response.status, json: await response.json().catch(() => null) };
  }

  async function answer<T>(method: "GET" | "POST", path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const { status, json } = await request(method, path, body);
    const parsed = schema.safeParse(json);
    if (status !== 200 || !parsed.success) throw new SignerUnavailable(`the signer answered ${status}`);
    return parsed.data;
  }

  // An observer that fails must never stop a payment, which may already have moved money.
  const note = (event: SignerEvent, entry: Record<string, unknown>) => {
    try {
      opts.observe?.(event, entry);
    } catch (error) {
      process.stderr.write(`[agent] could not record ${event}: ${error instanceof Error ? error.name : "error"}\n`);
    }
  };

  const receiptOf = async (txHash: Hex): Promise<PaymentReceipt | null> => {
    const r = (await answer("GET", `/receipt/${txHash}`, receipt)).receipt;
    return r ? { txHash: r.txHash as Hex, status: r.status, blockNumber: BigInt(r.blockNumber) } : null;
  };

  return {
    async simulate(call) {
      const r = await answer("POST", "/simulate", simulated, fields(call));
      const result: Simulation = r.ok ? { ok: true, payout: r.payout as Address } : { ok: false, revert: rawRevert(r.revert) };
      note("signer.simulate", { ...about(call, r.signer), simulation: result.ok ? { ok: true, payout: result.payout } : { ok: false, revert: result.revert.name } });
      return result;
    },
    async send(call, onSent): Promise<SendOutcome> {
      let answered: { status: number; json: unknown };
      try {
        answered = await request("POST", "/pay", { ...fields(call), ...(call.approval ? { approval: call.approval } : {}) });
      } catch (error) {
        note("signer.pay", { ...about(call, undefined), outcome: "unreachable" }); // it may or may not have signed
        throw error;
      }
      const { status, json } = answered;
      const refused = refusal.safeParse(json);
      if (status === 403 && refused.success) {
        note("signer.pay", { ...about(call, refused.data.signer), outcome: "refused", message: refused.data.message });
        return { ok: "refused", message: refused.data.message };
      }
      const r = sent.safeParse(json);
      if (status !== 200 || !r.success) {
        note("signer.pay", { ...about(call, undefined), outcome: "unanswered", status });
        throw new SignerUnavailable(`the signer answered ${status}`);
      }
      if (!r.data.ok) {
        const reverted = rawRevert(r.data.revert);
        note("signer.pay", { ...about(call, r.data.signer), outcome: "reverted", simulation: { ok: false, revert: reverted.name } });
        return { ok: false, revert: reverted };
      }
      const txHash = r.data.txHash as Hex;
      note("signer.pay", { ...about(call, r.data.signer), outcome: "sent", txHash, simulation: r.data.simulation ?? null });
      onSent?.(txHash);
      const deadline = Date.now() + (opts.receiptTimeoutMs ?? 120_000);
      while (Date.now() < deadline) {
        const mined = await receiptOf(txHash);
        if (mined) return { ok: true, receipt: mined };
        await wait(opts.pollMs ?? 2_000);
      }
      return { ok: "pending", txHash };
    },
    receipt: receiptOf,
    async health() {
      const h = await answer("GET", "/health", health);
      return { agent: h.agent as Address, vault: h.vault as Address, chainId: h.chainId, humanAboveYen: h.humanAboveYen };
    },
  };
}
