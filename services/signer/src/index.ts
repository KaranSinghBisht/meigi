// The signer as a library, for the agent's integration test (which runs it in-process against anvil).
export { createSignerApp, type SignerDeps, type SignerInfo } from "./app.js";
export { createPayer, type PayCall, type SignerPayer } from "./payer.js";
export { approvalRefusal, ceilingRule, ORB_ACR, type Approval, type Policy } from "./policy.js";
export { ConfigError, loadConfig, type Config } from "./config.js";
export { startSigner, type StartedSigner, type StartOptions } from "./start.js";
export { approversFrom, createApprovalVerifier, type ApprovalVerifier, type Verdict } from "./verify.js";
