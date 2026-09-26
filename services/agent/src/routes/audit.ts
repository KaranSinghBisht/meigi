import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../deps.js";

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  verify: z.enum(["0", "1", "true", "false"]).optional(),
});

/**
 * GET /audit?limit=100&verify=1: the newest audit entries, newest first; with `verify`, whether the whole hash chain
 * is intact and, if not, the first entry that breaks it.
 */
export function auditRoutes(deps: AppDeps) {
  const app = new Hono();
  app.get("/", (c) => {
    const query = auditQuery.parse({ limit: c.req.query("limit"), verify: c.req.query("verify") });
    const verify = query.verify === "1" || query.verify === "true";
    return c.json({ entries: deps.audit.recent(query.limit), ...(verify ? { chain: deps.audit.verify() } : {}) });
  });
  return app;
}
