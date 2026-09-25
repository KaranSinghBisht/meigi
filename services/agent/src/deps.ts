import type { AnalysisStore } from "./analysis/store.js";
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
  triageRequired: boolean;
  apiToken: string | null; // required as a bearer token on every POST when set
  demoDir: string; // scripts/demo-invoices
  info: HealthInfo;
}
