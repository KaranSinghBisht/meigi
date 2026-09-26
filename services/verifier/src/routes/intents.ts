import { Hono, type Context } from "hono";
import { getAddress, zeroHash, type Address, type Hex } from "viem";
import { z } from "zod";
import { nowSeconds, type AppDeps } from "../deps.js";
import { HttpError } from "../http.js";
import { policyOf } from "../limits/policy.js";
import type { RateLimiter } from "../limits/rate.js";
import {
  addressTarget,
  officerUpdateTarget,
  signApproval,
  sortOfficerIds,
  type ActionName,
} from "../registry/approvals.js";
import type { IntentRecord } from "../store/db.js";
import { formatTNumber, toChainId } from "../tnumber.js";
import { requireDigits } from "./lookup.js";

const INTENT_TTL_SECONDS = 15 * 60;
const CANCELS = ["CancelPayoutChange", "CancelRotation"] as const;
const actionEnum = z.enum(["PayoutChange", "ControllerRotation", "OfficerUpdate", ...CANCELS]);
type IntentAction = z.infer<typeof actionEnum>;

const createBody = z.object({
  tNumber: z.string().max(20),
  action: actionEnum,
  newAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/u).optional(),
  officers: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/u)).max(8).optional(),
  threshold: z.number().int().min(1).max(8).optional(),
});
const proofBody = z.object({ result: z.record(z.string(), z.unknown()) });

function isCancel(action: string): boolean {
  return (CANCELS as readonly string[]).includes(action);
}

function targetFor(body: z.infer<typeof createBody>): { target: Hex; payload: string | null } {
  if (body.action === "PayoutChange" || body.action === "ControllerRotation") {
    if (!body.newAddress) throw new HttpError(400, "missing_new_address", "newAddress is required");
    return { target: addressTarget(getAddress(body.newAddress)), payload: getAddress(body.newAddress) };
  }
  if (body.action === "OfficerUpdate") {
    if (!body.officers?.length || !body.threshold) throw new HttpError(400, "missing_officers", "officers required");
    const officers = sortOfficerIds(body.officers as Hex[]);
    const payload = JSON.stringify({ officers, threshold: body.threshold });
    return { target: officerUpdateTarget(officers, body.threshold), payload };
  }
  return { target: zeroHash, payload: null };
}

export function intentRoutes(deps: AppDeps, limiter: RateLimiter) {
  const app = new Hono();
  const policy = policyOf(deps);
  const client = (c: Context) => (deps.clientIp ? deps.clientIp(c) : "unknown");

  /** Opens an approval: which change, for which payee, at which nonce. Officers prove World ID against it. */
  app.post("/", async (c) => {
    const body = createBody.parse(await c.req.json());
    const digits = requireDigits(body.tNumber);
    limiter.hit("intents", client(c), policy.ratePerHour.intents, nowSeconds(deps));
    const tNumber = toChainId(digits);
    const payee = await deps.chain.payee(tNumber);
    if (payee.status !== 1) throw new HttpError(409, "payee_not_active", "payee is not active");
    const { target, payload } = targetFor(body);
    const deadline = nowSeconds(deps) + INTENT_TTL_SECONDS;
    const signal = intentSignal(deps, digits, body.action, target, payee.nonce, deadline);
    const id = deps.store.createIntent({
      tNumber: digits,
      action: body.action,
      target,
      nonce: payee.nonce.toString(),
      deadline: deadline.toString(),
      signal,
      payload,
    });
    const onchain = new Set(await deps.chain.officers(tNumber));
    const sessions = deps.store.sessionsFor(digits).filter((s) => onchain.has(s.officerId as Hex));
    const threshold = isCancel(body.action) ? 1 : payee.threshold;
    return c.json({ intentId: id, signal, threshold, deadline, sessions, rpContext: deps.world.rpContext() }, 201);
  });

  /** An officer proves their enrolled World ID session, bound to this intent's signal. */
  app.post("/:id/approve", async (c) => {
    const intent = deps.store.getIntent(c.req.param("id"));
    if (!intent) throw new HttpError(404, "intent_not_found", "unknown intent");
    if (nowSeconds(deps) > Number(intent.deadline)) throw new HttpError(410, "intent_expired", "open a new intent");
    const { result } = proofBody.parse(await c.req.json());
    limiter.hit("intents", client(c), policy.ratePerHour.intents, nowSeconds(deps)); // calls World's real verify API next
    const session = await deps.world.verify(result, intent.signal);
    const tNumber = toChainId(intent.tNumber);
    const officers = new Set(await deps.chain.officers(tNumber));
    if (!officers.has(session.officerId)) {
      const message = `This World ID is not an enrolled officer of ${formatTNumber(intent.tNumber)}: a different human.`;
      throw new HttpError(403, "not_an_officer", message);
    }
    if (!deps.store.consumeNullifier(session.sessionNullifier, `intent:${intent.id}`)) {
      throw new HttpError(409, "proof_replayed", "this proof was already used");
    }
    const approvals = deps.store.addApproval(intent.id, session.officerId, session.sybilScore);
    return c.json(await settle(deps, intent, approvals as Hex[]));
  });

  return app;
}

/** The World ID signal: every field that makes this approval unique, so a proof can't be reused elsewhere. */
function intentSignal(deps: AppDeps, digits: string, action: IntentAction, target: Hex, nonce: bigint, deadline: number) {
  const registry = deps.chain.registry.toLowerCase();
  return `meigi:v1:${deps.chain.chainId}:${registry}:${formatTNumber(digits)}:${action}:${target}:${nonce}:${deadline}`;
}

async function settle(deps: AppDeps, intent: IntentRecord, approvals: Hex[]) {
  const tNumber = toChainId(intent.tNumber);
  if (intent.action === "CancelPayoutChange") {
    return { status: "executed", txHash: await deps.chain.cancelPayoutChange(tNumber) };
  }
  if (intent.action === "CancelRotation") {
    return { status: "executed", txHash: await deps.chain.cancelRotation(tNumber) };
  }
  const payee = await deps.chain.payee(tNumber);
  if (approvals.length < payee.threshold) {
    return { status: "pending", approvals: approvals.length, threshold: payee.threshold };
  }
  if (payee.nonce.toString() !== intent.nonce) {
    throw new HttpError(409, "intent_stale", "the payee changed since this intent was opened; open a new one");
  }
  const approval = await signApproval(deps.chain.attester, {
    chainId: deps.chain.chainId,
    registry: deps.chain.registry,
    tNumber,
    action: intent.action as ActionName,
    target: intent.target as Hex,
    officerIds: approvals,
    nonce: payee.nonce,
    deadline: BigInt(intent.deadline),
  });
  if (intent.action === "ControllerRotation") {
    const txHash = await deps.chain.relayRotation(tNumber, intent.payload as Address, approval);
    return { status: "executed", txHash };
  }
  const wire = { ...approval, deadline: approval.deadline.toString() };
  return { status: "approved", approval: wire, payload: intent.payload };
}
