import { Hono } from "hono";
import { z } from "zod";
import { analyzeDocument } from "../analysis/analyze.js";
import { payAnalysis, type PayMode, type PayResult } from "../analysis/pay.js";
import type { StoredAnalysis } from "../analysis/store.js";
import { approvalRefusal } from "../approval/holds.js";
import { analysisEntry, paymentEntry } from "../audit/entries.js";
import { SignerUnavailable } from "../chain/remote-payer.js";
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
    deps.audit.record("analysis", analysisEntry(stored, text, approvalRefusal(stored) === null)); // unrecorded: no answer
    return c.json(present(deps, stored));
  });

  app.get("/:id", (c) => c.json(present(deps, load(deps, c.req.param("id")))));

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
      const approval = body.approvalId ? service(deps).consume(stored, body.approvalId) : undefined; // single use
      const mode: PayMode = approval ? "approved" : body.force ? "force" : "auto";
      const approvalId = body.approvalId ?? null;
      // Paid and pending results are kept (never pay or send twice); anything else clears a settled pending one.
      // A sent transaction is recorded before its receipt is awaited, so the log has it even if the agent stops.
      let recordedSend: string | null = null;
      const keep = (result: PayResult) => {
        stored.payment = result.status === "paid" || result.status === "pending" ? result : null;
      };
      const sent = (result: PayResult) => {
        keep(result);
        if (result.status !== "pending") return;
        recordedSend = result.txHash;
        audit(deps, "payment", paymentEntry(stored, mode, approvalId, result));
      };
      const before = stored.payment;
      const result = await payAnalysis(deps, stored, mode, sent, approval).catch((error: unknown) => {
        if (error instanceof SignerUnavailable) {
          error.sentTx = recordedSend ?? (before?.status === "pending" ? before.txHash : null);
          if (approval) error.approval = error.sentTx ? "not_needed" : "spent"; // a plain Pay reads a pending receipt
        }
        throw error;
      });
      keep(result);
      const unchanged = result === before || (result.status === "pending" && result.txHash === recordedSend); // nothing new
      if (!unchanged) audit(deps, "payment", paymentEntry(stored, mode, approvalId, result));
      return c.json(result);
    } finally {
      paying.delete(id);
    }
  });

  return app;
}

/**
 * The stored analysis plus whether a verified human could release its hold. `approvable` is computed even when the
 * feature is off, and live, because a payment changes it.
 */
function present(deps: AppDeps, stored: StoredAnalysis) {
  return { ...stored.view, approval: { enabled: deps.approvals !== null, approvable: approvalRefusal(stored) === null } };
}

/**
 * Records a payment step. The money has already moved (or been refused) by now, so a failed write is reported
 * loudly but never hides the result from the caller.
 */
function audit(deps: AppDeps, event: string, fields: Record<string, unknown>): void {
  try {
    deps.audit.record(event, fields);
  } catch (error) {
    process.stderr.write(`[agent] audit log write failed for ${event}: ${error instanceof Error ? error.name : "error"}\n`);
  }
}

