import { Hono } from "hono";
import { z } from "zod";
import { analyzeDocument } from "../analysis/analyze.js";
import { payAnalysis, type PayMode, type PayResult } from "../analysis/pay.js";
import type { StoredAnalysis } from "../analysis/store.js";
import type { AppDeps } from "../deps.js";
import { HttpError, readJson } from "../http.js";
import { load, service } from "./lookup.js";

const analyzeBody = z.object({ text: z.string().min(1).max(60_000) });
const payBody = z
  .object({ force: z.boolean().optional(), approvalId: z.uuid().optional() })
  .refine((body) => !(body.force && body.approvalId), { message: "use force or approvalId, not both", path: ["approvalId"] });

export function invoiceRoutes(deps: AppDeps) {
  const app = new Hono();
  const paying = new Set<string>();

  /** Reads a supplier invoice, email or x402 402-response and decides pay or hold. Moves no money. */
  app.post("/analyze", async (c) => {
    const { text } = analyzeBody.parse(await readJson(c));
    const stored = await analyzeDocument(deps, text);
    deps.store.save(stored);
    return c.json(stored.view);
  });

  app.get("/:id", (c) => c.json(load(deps, c.req.param("id")).view));

  /**
   * Pays an analysed invoice from the agent key. `force` attempts a held one to show the chain's answer;
   * `approvalId` spends a verified human's approval (once) on a hold only a person may release.
   */
  app.post("/:id/pay", async (c) => {
    const stored = load(deps, c.req.param("id"));
    const body = payBody.parse(await readJson(c));
    const id = stored.view.id;
    if (paying.has(id)) throw new HttpError(409, "payment_in_progress", "this invoice is already being paid");
    paying.add(id);
    try {
      const mode: PayMode = body.approvalId ? spendApproval(deps, stored, body.approvalId) : body.force ? "force" : "auto";
      // Paid and pending results are kept (never pay or send twice); anything else clears a settled pending one.
      const keep = (result: PayResult) => {
        stored.payment = result.status === "paid" || result.status === "pending" ? result : null;
      };
      const result = await payAnalysis(deps, stored, mode, keep);
      keep(result);
      return c.json(result);
    } finally {
      paying.delete(id);
    }
  });

  return app;
}

/** An approval pays once: any second use is a 409 (check a pending payment with a plain POST /pay). */
function spendApproval(deps: AppDeps, stored: StoredAnalysis, approvalId: string): PayMode {
  service(deps).consume(stored, approvalId);
  return "approved";
}
