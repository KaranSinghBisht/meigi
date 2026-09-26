import type { BeforePaymentCreationHook, ClientExtension } from "@x402/core/client";
import {
  checkPayee,
  checkUndeclared,
  MEIGI_PAYEE_KEY,
  type GuardDeps,
  type GuardVerdict,
  type UnverifiedPolicy,
} from "./check.js";

export interface GuardOptions {
  /** Called with every verdict, e.g. to show it in an agent console. */
  onVerdict?: (verdict: GuardVerdict) => void;
}

/**
 * x402 client extension. Runs before the buyer signs whenever the merchant declared `meigi-payee`, and aborts
 * the payment unless `payTo` is the declared company's registered payout.
 *
 *   client.registerExtension(meigiPayeeExtension(deps));
 */
export function meigiPayeeExtension(deps: GuardDeps, options: GuardOptions = {}): ClientExtension {
  return {
    key: MEIGI_PAYEE_KEY,
    hooks: {
      async onBeforePaymentCreation(declaration, context) {
        const verdict = await checkPayee(deps, declaration, context.selectedRequirements);
        options.onVerdict?.(verdict);
        return verdict.ok ? undefined : { abort: true, reason: verdict.reason };
      },
    },
  };
}

/**
 * Strict policy for agents: refuse merchants that don't declare a Meigi payee at all.
 *
 *   client.onBeforePaymentCreation(requireMeigiPayee());
 */
export function requireMeigiPayee(options: GuardOptions = {}): BeforePaymentCreationHook {
  return async (context) => {
    if (context.paymentRequired.extensions?.[MEIGI_PAYEE_KEY] !== undefined) return undefined;
    const verdict: GuardVerdict = {
      ok: false,
      code: "no_declaration",
      reason: "merchant does not declare a Meigi-verified payee; refusing to pay an unverified address",
    };
    options.onVerdict?.(verdict);
    return { abort: true, reason: verdict.reason };
  };
}

/**
 * Tiered policy for agents: merchants that declare a Meigi payee are left to `meigiPayeeExtension` (registry
 * check); merchants that don't may only be paid up to `policy.maxAmount`, after screening clears `payTo`.
 *
 *   client.onBeforePaymentCreation(screenUndeclaredPayee({ screen, maxAmount }));
 */
export function screenUndeclaredPayee(policy: UnverifiedPolicy, options: GuardOptions = {}): BeforePaymentCreationHook {
  return async (context) => {
    if (context.paymentRequired.extensions?.[MEIGI_PAYEE_KEY] !== undefined) return undefined;
    const verdict = await checkUndeclared(policy, context.selectedRequirements);
    options.onVerdict?.(verdict);
    return verdict.ok ? undefined : { abort: true, reason: verdict.reason };
  };
}

/**
 * For merchants: the extension entry to add to `PaymentRequired.extensions`. It names the payee's ENS name too,
 * unless `ens: false`, for a chain without ENS: buyers there can check the registry alone.
 */
export function meigiPayeeDeclaration(tNumber: string, options: { ens?: boolean } = {}): Record<string, unknown> {
  const digits = tNumber.replace(/^T/iu, "");
  const ens = options.ens === false ? {} : { ens: `t${digits}.payee.eth` };
  return { [MEIGI_PAYEE_KEY]: { tNumber: `T${digits}`, ...ens } };
}
