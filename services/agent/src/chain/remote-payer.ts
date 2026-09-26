import type { Address, Hex } from "viem";
import { z } from "zod";
import { decodeRaw } from "./revert.js";
import type { PayCall, PayerPort, PaymentReceipt, RawRevert, SendOutcome } from "./types.js";

/**
 * The agent's side of services/signer: the process that alone holds the agent key. The agent sends typed
 * payInvoice fields and a bearer token over localhost; the signer simulates, applies its own ceiling, and signs.
 * A sent transaction is reported (onSent) as soon as the signer broadcasts it; its receipt is then polled.
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

export interface RemotePayerOptions {
  url: string; // http://127.0.0.1:8796
  token: string; // SIGNER_TOKEN
  fetch?: typeof fetch;
  timeoutMs?: number;
  pollMs?: number;
  receiptTimeoutMs?: number;
  wait?: (ms: number) => Promise<void>;
}

const revert = z.union([z.object({ data: z.string().regex(/^0x[0-9a-fA-F]*$/u) }), z.object({ reason: z.string() }), z.object({ unknown: z.literal(true) })]);
const simulated = z.union([z.object({ ok: z.literal(true), payout: z.string() }), z.object({ ok: z.literal(false), revert })]);
const sent = z.union([z.object({ ok: z.literal(true), txHash: z.string() }), z.object({ ok: z.literal(false), revert })]);
const receipt = z.object({
  receipt: z.object({ txHash: z.string(), status: z.enum(["success", "reverted"]), blockNumber: z.string().regex(/^\d+$/u) }).nullable(),
});
const health = z.object({ agent: z.string(), vault: z.string(), chainId: z.number(), humanAboveYen: z.number() });
const refusal = z.object({ code: z.literal("human_approval_required"), message: z.string() });

function rawRevert(r: z.infer<typeof revert>): RawRevert {
  if ("data" in r) return decodeRaw(r.data as Hex);
  if ("reason" in r) return { name: "Error", inputs: [{ name: "reason", type: "string" }], args: [r.reason] };
  return { name: "UnknownRevert", inputs: [], args: [] };
}

function fields(call: PayCall) {
  return { tNumber: call.tNumber.toString(), payout: call.expectedPayout, amount: call.amount.toString(), invoiceRef: call.invoiceRef };
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

  const receiptOf = async (txHash: Hex): Promise<PaymentReceipt | null> => {
    const r = (await answer("GET", `/receipt/${txHash}`, receipt)).receipt;
    return r ? { txHash: r.txHash as Hex, status: r.status, blockNumber: BigInt(r.blockNumber) } : null;
  };

  return {
    async simulate(call) {
      const r = await answer("POST", "/simulate", simulated, fields(call));
      return r.ok ? { ok: true, payout: r.payout as Address } : { ok: false, revert: rawRevert(r.revert) };
    },
    async send(call, onSent): Promise<SendOutcome> {
      const { status, json } = await request("POST", "/pay", { ...fields(call), ...(call.approval ? { approval: call.approval } : {}) });
      const refused = refusal.safeParse(json);
      if (status === 403 && refused.success) return { ok: "refused", message: refused.data.message };
      const r = sent.safeParse(json);
      if (status !== 200 || !r.success) throw new SignerUnavailable(`the signer answered ${status}`);
      if (!r.data.ok) return { ok: false, revert: rawRevert(r.data.revert) };
      const txHash = r.data.txHash as Hex;
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
