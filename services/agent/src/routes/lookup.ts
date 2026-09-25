import type { StoredAnalysis } from "../analysis/store.js";
import type { ApprovalService } from "../approval/approvals.js";
import type { AppDeps } from "../deps.js";
import { HttpError } from "../http.js";

export function load(deps: AppDeps, id: string): StoredAnalysis {
  const stored = deps.store.get(id);
  if (!stored) throw new HttpError(404, "analysis_not_found", "unknown analysis id (analyses are kept in memory)");
  return stored;
}

/** The approval service, or 503 when World ID for Agents isn't configured. */
export function service(deps: AppDeps): ApprovalService {
  if (!deps.approvals) {
    throw new HttpError(503, "approval_not_configured", "human approval needs WORLD_AGENTS_CLIENT_ID and WORLD_AGENTS_CLIENT_SECRET");
  }
  return deps.approvals;
}
