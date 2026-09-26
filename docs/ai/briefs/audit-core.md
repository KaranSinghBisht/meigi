# audit-core: Audit security & agent claims

Agent type `oh-my-claudecode:verifier`, started Sat 16:23 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are an **independent auditor of Meigi's core security and agent claims**. Repo: `<workspace>/meigi`. The team says the following. Verify each against **code, tests and live behaviour**, adversarially, and report where reality differs.

**Contracts** (contracts/src):
1. A payout can only change through the business key plus a quorum of World ID officers, with a 72-hour public timelock. Only the controller, an attester or the owner can cancel.
2. The AgentVault pays only approved vendors, at the registry's registered payout, within per-payment and period caps; anything else reverts (PayeeMismatch etc.).
3. PayRouter pays only the registered payout.
4. Disputed or retired payees can't be paid.
Run `forge test` (121 tests expected), read the relevant functions, and look for bypasses.

**Signer** (services/signer): the agent holds no key; only the signer does. It signs only `AgentVault.payInvoice`, from typed fields, after simulating; it needs a token; above ¥150,000 it needs a human approval. Check:
- `services/agent` refuses to start with AGENT_PRIVATE_KEY in its env;
- whether `.env` still contains AGENT_PRIVATE_KEY (check only whether the variable **name** exists; never print values; `.env.signer` should hold it);
- `scripts/ap-stack.sh`.

**Agent** (services/agent):
- "the LLM only proposes; a deterministic kernel decides";
- the triage model (Kev) and where it runs;
- World ID for Agents validation (RS256/JWKS, iss/aud, acr, auth_time, pairwise sub);
- the hash-chained audit log: tamper-evidence, and whether `/audit?verify=1` actually verifies;
- "force can't override screening_flagged";
- Intercepta screening.
Run `pnpm --filter @meigi/agent test`, and hit the running agent read-only at http://127.0.0.1:8788: `/health`, and `/audit?verify=1`. Don't POST pay or force endpoints.

**Verifier** (services/verifier):
- IDKit 4.0 proofs verified server-side;
- anti-squatting limits (3 companies per officer, 1 open claim, 8 officers);
- rate limits; the credential enforcement (Selfie Check or Orb).
Run its tests.

**x402 guard** (packages/x402-guard): refuses a payTo that isn't the registered payout; ENS and registry must agree.

**Output:** a table with claim · verdict (TRUE / FALSE / PARTIAL / UNTESTED) · evidence (file:line or test name or command output, secrets redacted) · gap/fix, sorted by severity. Read-only: no file edits, no broadcasts. Finish within about 60–75 minutes and report to the lead.

## Follow-up instructions
