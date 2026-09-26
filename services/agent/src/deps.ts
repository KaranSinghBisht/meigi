import type { AnalysisStore } from "./analysis/store.js";
import type { HoldPolicy } from "./analysis/verdict.js";
import type { ApprovalService } from "./approval/approvals.js";
import type { HistorySources } from "./history/read.js";
import type { ChainPort, PayerPort } from "./chain/types.js";
import type { LlmPort } from "./llm/types.js";
import type { ScreeningPort } from "./screening/intercepta.js";
import type { TriagePort } from "./triage/triage.js";

/** What /health reports: which layers are wired up. Never secrets. */
export interface HealthInfo {
  chainId: number;
  vault: string;
  agent: string;
  triage: string[];
  triageRequired: boolean;
  llm: string;
  screening: boolean;
  humanApproval: boolean; // World ID for Agents is configured: held payments can be approved by a verified human
  multibaas: boolean; // settlement history comes from MultiBaas's event index (else RPC logs)
}

/** Everything the routes need, injected so tests can swap in fakes. */
export interface AppDeps {
  chain: ChainPort;
  payer: PayerPort;
  triage: TriagePort;
  llm: LlmPort | null;
  screening: ScreeningPort;
  store: AnalysisStore;
  vendorTNumbers: string[]; // 13 digits each, for GET /vault
  origins: string[];
  allowedHosts: string[]; // Host names the agent answers on (localhost forms plus AGENT_ALLOWED_HOSTS)
  triageRequired: boolean;
  holds: HoldPolicy;
  approvals: ApprovalService | null; // null: World ID for Agents is not configured
  history: HistorySources; // settlement history: MultiBaas when configured, RPC logs as the fallback
  apiToken: string | null; // required as a bearer token on every POST when set
  demoDir: string; // scripts/demo-invoices
  info: HealthInfo;
}
