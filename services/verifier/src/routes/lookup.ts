import { Hono, type Context } from "hono";
import { nowSeconds, type AppDeps } from "../deps.js";
import { HttpError } from "../http.js";
import { policyOf } from "../limits/policy.js";
import type { RateLimiter } from "../limits/rate.js";
import { formatTNumber, hasCorporateCheckDigit, isUnassignableOffice, parseTNumber, toChainId } from "../tnumber.js";

const STATUS = ["unregistered", "active", "disputed"] as const;

export function requireDigits(input: string): string {
  const digits = parseTNumber(input);
  if (!digits) throw new HttpError(400, "invalid_t_number", "expected T followed by 13 digits");
  return digits;
}

export function lookupRoutes(deps: AppDeps, limiter: RateLimiter) {
  const app = new Hono();
  const policy = policyOf(deps);
  const client = (c: Context) => (deps.clientIp ? deps.clientIp(c) : "unknown");

  app.get("/world/rp-context", (c) => {
    limiter.hit("rpContext", client(c), policy.ratePerHour.rpContext, nowSeconds(deps));
    return c.json(deps.world.rpContext());
  });

  /** Public NTA data for a T-number: what a business must match exactly to register. */
  app.get("/nta/:tNumber", (c) => {
    limiter.hit("nta", client(c), policy.ratePerHour.nta, nowSeconds(deps));
    const digits = requireDigits(c.req.param("tNumber"));
    const corporation = deps.corporations.byNumber(digits);
    return c.json({
      tNumber: formatTNumber(digits),
      corporateCheckDigit: hasCorporateCheckDigit(digits),
      // Registry office 9999 is never issued: with fixtures on, such a number registers as a fictional demo company.
      fixture: deps.fixtures === true && isUnassignableOffice(digits) && hasCorporateCheckDigit(digits),
      corporation: corporation && {
        name: corporation.name,
        enName: corporation.enName,
        kind: corporation.kind,
        address: `${corporation.pref}${corporation.city}${corporation.street}`,
        closed: corporation.closeDate !== "",
      },
    });
  });

  /**
   * The registry's view of a payee. A queued payout address is reported as a flag, never shown. Only an active
   * payee is named: a disputed record's name may be the claim under dispute (like the resolver and the agent).
   */
  app.get("/payees/:tNumber", async (c) => {
    limiter.hit("payees", client(c), policy.ratePerHour.payees, nowSeconds(deps));
    const digits = requireDigits(c.req.param("tNumber"));
    const payee = await deps.chain.payee(toChainId(digits));
    const active = payee.status === 1;
    return c.json({
      tNumber: formatTNumber(digits),
      status: STATUS[payee.status] ?? "unknown",
      legalName: active ? payee.legalName : null,
      payout: active ? payee.payout : null,
      changePending: payee.pending !== "0x0000000000000000000000000000000000000000",
      rotationPending: payee.nextController !== "0x0000000000000000000000000000000000000000",
      threshold: payee.threshold,
    });
  });

  return app;
}
