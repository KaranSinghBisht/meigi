# latereview: Review tonight's payment/registration changes

Agent type `oh-my-claudecode:security-reviewer`, started Sat 20:36 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You're doing a read-only security and regression review of the late changes (after 17:00 JST today) to Meigi's payment and registration paths. Meigi is Confirmation of Payee for stablecoins and AI agents, live on Sepolia. The repo is `<workspace>/meigi`. Tomorrow's live judging demo, and a video Karan records tonight, run on this code. The question: **can any of it pay the wrong address, pay twice, leak a key, or break the demo?**

## Commits to review
Use `git show`, and read the resulting files in full where needed.
- `1dec27c`: signer, agent and x402-demo get a fallback Sepolia RPC. The signer's broadcast path is `services/signer/src/broadcast.ts`: sign once, precompute the hash, check both RPCs, resend the same bytes.
- `830daac` and `deaa3ee`: the verifier's RPC fallback and a new attester write path (prepare → signTransaction → sendRawTransaction → sendKnown), plus the anvil tests.
- `2c946d6`, `2d4a81a` and `db95105`: the signer and agent pay through the ENS **MandateGate** (`contracts/src/payments/MandateGate.sol`) when `SIGNER_VIA_GATE=1`, with startup checks on principal and label. **The gate is live now:** `vault.agent()` is the gate 0x591dd2b2716b46740C665749A60209B7b22e83BF.
- `5575671`, `8f81b93` and `4f87e61`:
  - the agent's 503 `signer_unavailable` wording;
  - `scripts/ap-stack.sh --pause-signer` / `--resume-signer`, the supervisor loop changes, and `--stop` reaping orphans.
  - The live pair runs 5575671 + 8f81b93. 4f87e61 takes effect at the next restart.
- `444f309`: `demo:renumber`, which moves a spent demo invoice number to a fresh one.
- `b9b0e5c`: the web's live refusal, a viem simulateContract `eth_call` from `vault.agent()`.
- `4db0542`: the web's issued-names block and the withdrawal check wording.

## Look for
- **Money:** any path where a payment is signed or sent twice, sent without the simulate-first step, sent to anything other than the vault's payInvoice (directly or through the gate), or sent with fields not taken from the analysed invoice.
- **Broadcast edge cases:** "already known"; a nonce collision on a *different* hash; both RPCs down; a timeout after acceptance. Is anything ever re-signed?
- **Keys:** can any error message, log line, audit entry or HTTP response contain a private key, a keyed RPC URL, the approval token, or a signed transaction that shouldn't leave the process?
- **The verifier's new write path:** chain ID and EIP-1559 fields, nonce handling across the five attester writes when they run back to back, and what happens if prepare succeeds but send fails.
- **Gate startup checks:** can a misconfigured `.env` make the signer start and pay somewhere unintended? Is a dark mandate handled fail-closed?
- **ap-stack.sh:** can `--pause-signer` leave the signer down unnoticed, or leave two signers running? Is `--stop` safe?
- **Web:** any XSS path from on-chain strings (ENS text records, legal names) into the DOM, e.g. `dangerouslySetInnerHTML` or unescaped attributes. Any chance the live refusal button sends a real transaction? It must be `eth_call` only.
- **Regressions** that could break tomorrow's demo: invoice 01 pays, 02 holds, 07 is approvable, and a forced 02 reverts `PayeeMismatch`.

## Rules
- Read-only: no edits and no commits.
- Don't touch the live services on :8787, :8788, :8796 or :8790. Don't run `ap-stack.sh`.
- You may run the unit tests in a temporary git worktree of HEAD (`git worktree add`), never in the main tree, which is frozen for a recording. Remove the worktree after.
- Never print `.env` values.

## Report
Findings ranked CRITICAL / HIGH / MEDIUM / LOW. For each: file:line, a concrete failure scenario, and the smallest fix. Then state clearly whether anything must be fixed **before tonight's recording**, and what can wait until after.

## Follow-up instructions
