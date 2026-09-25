import { Hono } from "hono";
import type { AppDeps } from "../deps.js";
import { HttpError, readJson } from "../http.js";
import { load, service } from "./lookup.js";

/**
 * A verified human's release of a held payment (World ID for Agents, RFC 8628 device grant). POST starts an
 * attempt and returns the code to show; GET reports it. Paying stays POST /invoices/:id/pay { approvalId }.
 */
export function approvalRoutes(deps: AppDeps) {
  const app = new Hono();

  app.post("/:id/approval", async (c) => {
    const approvals = service(deps);
    await readJson(c); // no fields; application/json keeps cross-site forms out
    return c.json(await approvals.start(load(deps, c.req.param("id"))), 202);
  });

  app.get("/:id/approval", (c) => {
    const state = service(deps).status(load(deps, c.req.param("id")).view.id);
    if (!state) throw new HttpError(404, "approval_not_found", "no approval was requested for this invoice");
    return c.json(state);
  });

  return app;
}
