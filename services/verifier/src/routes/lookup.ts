import { Hono } from "hono";
import type { AppDeps } from "../deps.js";
import { HttpError } from "../http.js";
import { formatTNumber, hasCorporateCheckDigit, parseTNumber, toChainId } from "../tnumber.js";

const STATUS = ["unregistered", "active", "disputed"] as const;

export function requireDigits(input: string): string {
  const digits = parseTNumber(input);
  if (!digits) throw new HttpError(400, "invalid_t_number", "expected T followed by 13 digits");
  return digits;
}

export function lookupRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/world/rp-context", (c) => c.json(deps.world.rpContext()));

  /** Public NTA data for a T-number: what a business must match exactly to register. */
  app.get("/nta/:tNumber", (c) => {
    const digits = requireDigits(c.req.param("tNumber"));
    const corporation = deps.corporations.byNumber(digits);
    return c.json({
      tNumber: formatTNumber(digits),
      corporateCheckDigit: hasCorporateCheckDigit(digits),
      corporation: corporation && {
        name: corporation.name,
        enName: corporation.enName,
        kind: corporation.kind,
        address: `${corporation.pref}${corporation.city}${corporation.street}`,
        closed: corporation.closeDate !== "",
      },
    });
  });

  /** The registry's view of a payee. A queued payout address is reported as a flag, never shown. */
  app.get("/payees/:tNumber", async (c) => {
    const digits = requireDigits(c.req.param("tNumber"));
    const payee = await deps.chain.payee(toChainId(digits));
    return c.json({
      tNumber: formatTNumber(digits),
      status: STATUS[payee.status] ?? "unknown",
      legalName: payee.legalName,
      payout: payee.status === 1 ? payee.payout : null,
      changePending: payee.pending !== "0x0000000000000000000000000000000000000000",
      rotationPending: payee.nextController !== "0x0000000000000000000000000000000000000000",
      threshold: payee.threshold,
    });
  });

  return app;
}
