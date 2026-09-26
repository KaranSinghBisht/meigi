import { Hono } from "hono";
import { z } from "zod";
import { nowSeconds, type AppDeps } from "../deps.js";
import { HttpError } from "../http.js";
import { policyOf } from "../limits/policy.js";
import type { RateLimiter } from "../limits/rate.js";
import { formatTNumber } from "../tnumber.js";

const objectionBody = z.object({
  reason: z.string().trim().min(10).max(1000),
  contact: z.string().trim().max(200).optional(),
});

/**
 * The public pending window: registrations that passed every check wait here (VERIFIER_PENDING_HOURS) before the
 * attester submits them, so the real company can object to a squatter. Listings carry no officer data or wallets.
 */
export function pendingRoutes(deps: AppDeps, limiter: RateLimiter) {
  const app = new Hono();
  const policy = policyOf(deps);

  app.get("/pending", (c) => {
    const registrations = deps.store
      .pendingRegistrations()
      .map((listing) => ({ ...listing, tNumber: formatTNumber(listing.tNumber) }));
    return c.json({ windowHours: policy.pendingHours, registrations });
  });

  /** Flags a queued registration for manual review; the attester then won't submit it on its own. */
  app.post("/:id/object", async (c) => {
    const client = deps.clientIp ? deps.clientIp(c) : "unknown";
    limiter.hit("objections", client, policy.ratePerHour.objections, nowSeconds(deps));
    const body = objectionBody.parse(await c.req.json());
    const listing = deps.store.pendingByPublicId(c.req.param("id"));
    if (!listing) throw new HttpError(404, "pending_not_found", "no registration is waiting under this id");
    deps.store.addObjection(listing.id, body.reason, body.contact ?? null, nowSeconds(deps) * 1000);
    return c.json({ id: listing.id, tNumber: formatTNumber(listing.tNumber), status: "under_review" }, 202);
  });

  return app;
}
