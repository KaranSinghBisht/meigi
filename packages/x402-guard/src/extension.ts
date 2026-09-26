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

/** The minimal surface `registerMeigiGuard` needs from an x402 client - satisfied by the real `x402Client`. */
export interface GuardClient {
  registerExtension(extension: ClientExtension): unknown;
  onBeforePaymentCreation(hook: BeforePaymentCreationHook): unknown;
}

export interface MeigiGuardOptions extends GuardOptions {
  /**
   * How to treat a merchant that declares no Meigi payee at all: `"refuse"` pairs with `requireMeigiPayee`
   * (strict - refuse it outright); an `UnverifiedPolicy` pairs with `screenUndeclaredPayee` (screened and
   * capped). Leave it out only if you understand the risk - see `registerMeigiGuard`'s own doc comment.
   */
  undeclared?: "refuse" | UnverifiedPolicy;
}

/**
 * Registers both halves of the guard on one client. `meigiPayeeExtension`'s hook only ever runs for a merchant
 * that *did* declare a Meigi payee - that is how `x402Client` invokes declared-extension hooks, gated on
 * `paymentRequired.extensions[key]` being present. A merchant that declares nothing is invisible to it, so it
 * needs the separate `requireMeigiPayee` / `screenUndeclaredPayee` hook registered too. Nothing in `@x402/core`
 * enforces registering both, which is exactly the gap: call `client.registerExtension(meigiPayeeExtension(...))`
 * alone (as written, or after a refactor drops the second half) and every undeclared merchant is paid with no
 * check at all, silently.
 *
 * This is the one place that gap is caught: pass `undeclared: "refuse"` or an `UnverifiedPolicy`, and both
 * halves are registered together. Leave `undeclared` out and you still get the extension only - same as
 * calling `registerExtension` by hand - except now it's impossible to do by accident: a loud console warning
 * fires every time, instead of a silent gap.
 */
export function registerMeigiGuard<C extends GuardClient>(client: C, deps: GuardDeps, options: MeigiGuardOptions = {}): C {
  client.registerExtension(meigiPayeeExtension(deps, options));
  if (options.undeclared === "refuse") {
    client.onBeforePaymentCreation(requireMeigiPayee(options));
  } else if (options.undeclared) {
    client.onBeforePaymentCreation(screenUndeclaredPayee(options.undeclared, options));
  } else {
    console.warn(
      "[meigi-guard] registerMeigiGuard() was called with no `undeclared` policy: any merchant that declares " +
        'no Meigi payee at all will be paid with NO check. Pass undeclared: "refuse" to refuse such merchants, ' +
        "or an UnverifiedPolicy ({ screen, maxAmount }) to screen and cap them instead.",
    );
  }
  return client;
}
