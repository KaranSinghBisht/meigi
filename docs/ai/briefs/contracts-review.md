# contracts-review: Security review of Meigi contracts

Agent type `oh-my-claudecode:security-reviewer`, started Sat 02:18 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

Do a read-only security review of Meigi's Solidity contracts before they hold demo funds on Sepolia.

Repo: <workspace>/meigi/contracts (Foundry, solc 0.8.28, OpenZeppelin v5.4.0).

Files:
- src/registry/PayeeRegistry.sol
- src/registry/IPayeeRegistry.sol
- src/registry/TNumber.sol
- src/ens/PayeeResolver.sol
- src/payments/PayeeGuard.sol
- src/payments/PayRouter.sol
- src/payments/AgentVault.sol
- src/token/MockJPYC.sol

Tests are in test/. 67 pass; run `forge test` to confirm.

Design intent:
- **PayeeRegistry.** Attesters (an off-chain verifier service) register T-number → payout after NTA, DNS and World ID checks.
  - A payout change needs msg.sender == controller plus an attester EIP-712 signature. The signature covers (tNumber, action, target, sorted officer nullifiers, the payee nonce, deadline).
  - Those nullifiers must be enrolled officers and must meet the threshold. The change then waits out `changeDelay` (72h in production).
  - Cancel is allowed for the controller, an attester or the owner. Disputes freeze the payee and drop pending changes.
  - rotateController needs only an officer approval (recovery). updateOfficers needs the controller plus an approval.
  - The owner (governance) resolves disputes and manages attesters.
- **AgentVault.** The AI agent key may only call `payInvoice(tNumber, expectedPayout, amount, invoiceRef)`.
  - The vendor must be owner-approved, with the approval past `vendorDelay`.
  - The amount must be within the per-payment and 30-day caps.
  - Money goes only to the registry's active payout. A non-zero expectedPayout that mismatches reverts.
  - The owner manages vendors, withdrawals and pause.
- **PayRouter.** A stateless pull payment to the registry's payout.
- **PayeeResolver.** An ENSIP-10 wildcard resolver for t<13 digits>.payee.eth. It must fail closed (zero address) for disputed or unknown payees.
- **MockJPYC.** A testnet ERC20 with EIP-2612 and EIP-3009 (transfer/receive/cancelWithAuthorization), including EIP-1271 signers, with open mint capped per call.

Adversaries to consider:
- a fully prompt-injected agent
- a thief holding the controller key
- a malicious or compromised attester
- a squatter or front-runner on registration
- signature replay across actions, chains or payees
- griefing through disputes and cancels
- token weirdness: fee-on-transfer, ERC777-style hooks, reentrancy

Deliver a ranked list of concrete findings. For each give the severity, file:line, the exploit scenario, and a minimal fix. Specifically check:
- **EIP-712 correctness:** the typehash string vs the actual encoding, especially the `bytes32[] nullifiers` array encoding and the uint8 action.
- **Signatures:** malleability and nonce handling.
- **Timelock and storage edge cases:** a request replacing an existing pending change; settle ordering; rotateController with a pending change; resolveDispute rewriting officers; a nonce that isn't reset.
- **ENSIP-10 edge cases:** DNS-name parsing, multicall recursion and gas, coinType handling, and whether the resolver's text records could mislead a wallet.
- **The core guarantee:** anything that could break "the agent can never pay an unregistered address" or "a payout change can't land without an enrolled officer plus the delay".

Don't edit any files. Be precise and skip style nits. If something is a deliberate trust assumption rather than a bug (e.g., attesters are trusted to verify World ID), label it that way and say what a production version should do instead.

## Follow-up instructions

### Sat 02:48 JST: Re-verify fixes against your PoCs

Please verify the fixes for your findings, committed as 07b7d4f in <workspace>/meigi/contracts. Re-run your PoCs against the new code, adapting them to the API changes below, and report per finding: fixed / partially fixed / still open, plus anything new the changes introduced. Read-only again, no edits to project files.

API changes:
- Officer logic moved to src/registry/OfficerQuorum.sol. `OfficerApproval.nullifiers` is now `officerIds`, and the typehash string says `bytes32[] officerIds`.
- `rotateController` is replaced by `requestControllerRotation` (queued behind changeDelay) + `cancelControllerRotation` (controller, attester or owner). requestPayoutChange and updateOfficers revert `RotationPending` while a rotation is queued.
- Queued payout changes and rotations record the approving attester. They only count while `isAttester[that]` is true.
- resolveDispute only queues the winner. The new finalizeDispute applies it after changeDelay, and the payee stays Disputed until then. A new fileDispute clears a queued resolution.
- The nonce bumps on cancels, fileDispute and _write (register/finalize).
- `payoutOf` returns zero unless the payee is Active. `renounceOwnership` reverts on the registry and the vault.
- PayeeResolver's constructor is (registry, parentDnsName). It only answers names exactly one label below that parent. `meigi.pending` is replaced by `meigi.changePending`. Multicall isolates failures. supportsInterface is ERC165 + ENSIP-10 only.
- AgentVault pins `payout` per vendor at approveVendor (which requires an active payee). payInvoice reverts `VendorPayoutChanged` if the registry moved. Invoice dedup stores amounts, and only the owner may add to an already-paid ref. Cap math saturates.
- PayRouter emits the received amount. MockJPYC tries ECDSA before 1271 and has v,r,s overloads.

Findings I did NOT fix, by design; tell me if you disagree:
- Attesters remain trusted to verify World ID off-chain (documented).
- Fixed 30-day cap windows (documented as up to 2x).
- coinType 60 returns the Sepolia payout.
- The router's Paid event can be emitted with any token (documented: indexers must allowlist tokens).

### Sat 03:06 JST: Nudge: re-verification still needed

Reminder: please re-verify the fixes (commit 07b7d4f) against your PoCs, as described in my previous message. I'm holding the Sepolia deploy for your verdict. Reply with per-finding status: fixed / partial / open, plus anything new. Read-only, as before.

### Sat 16:34 JST: Heads-up: you'll review CompanyNamespace.sol (ENSv2) in ~2–3h

Heads-up, no action yet. In about 2–3 hours the `ens` agent will ask you to review a new contract, **`CompanyNamespace.sol`** (~120 lines). It's a gate that lets a registered company's controller issue ENSv2 subnames under its claimed `t<n>.payee.eth` (e.g. `ap.`, `keiri.`, `zeirishi.`). Authority is checked live against `PayeeRegistry.payeeOf(t).controller` and Active status. Each subname gets its own PermissionedResolver with a pinned addr, text roles scoped to `agent-status`, non-transferable tokens, expiry ≤ the claim's, a label rule refusing `t` + 13 digits, and Meigi's root brake. If you have time now, read contracts/script/ens (our ENSv2 scripts) and docs/ens.md so you're ready. When the request comes: adversarial review, findings by severity, read-only.

### Sat 16:42 JST: Thanks — decisions on your 3 flags

Excellent early flags; they're acted on. Decisions sent to ens:
1. Issued names become **text-only**: no addr and no primary name. The agent's identity is published via ENSIP-26 texts and an ENSIP-25 link to an ERC-8004 registration, with an optional Active-gated resolver.
2. `renew()` only for live names (`getOwner != 0`).
3. A Meigi reset path plus an epoch or nonce in the salt.
Also the smaller points: the holder role for agent-status only, ENSIP-15-normal labels, no contract holders, and a check for no root-node fallback.
When ens asks for the formal review, please verify all of the above adversarially, with fork PoCs against the live Beta implementations as you planned.

### Sat 16:56 JST: GO: formal review of CompanyNamespace (732acec..4ae9985 + f4c59b0)

**Formal review, go.** CompanyNamespace commits: **732acec** (contract, interfaces, tests), **f4c59b0** (live script, ens.sh `ns-*` commands, stock-viem check, fork e2e), **4ae9985** (the brake is unregister-only: Meigi can take a name down or detach the namespace, but never re-point a resolver; issue() now follows checks-effects-interactions). Files:
- `contracts/src/ens/CompanyNamespace.sol` and `IEnsV2.sol`;
- tests `test/ens/CompanyNamespace.t.sol` and `CompanyNamespaceFork.t.sol`;
- `script/ens/CompanyNames.s.sol`, `names-e2e.sh`, `check-names-viem.mjs`, `ens.sh`.

**Design as built, per ens:**
- **Authority:** `onlyController` reads `payeeOf(t)` live and requires Active and controller == msg.sender (open, issue, setText, renew, revoke).
- **open:** deploys a UserRegistry per T-number via VerifiableFactory. The gate holds REGISTRAR, RENEW, UNREGISTER and SET_PARENT; the brake holds UNREGISTER only; no admin or UPGRADE roles.
- **issue:**
  - label rules `[a-z0-9-]{1,32}`, no edge hyphens, no `xn--`, no 13-digit runs;
  - expiry in (now, the claim's expiry];
  - `meigi.*` keys reserved;
  - a fresh PermissionedResolver per name with addr(60) = holder pinned (the gate keeps only SET_TEXT and SET_TEXT_ADMIN);
  - the holder gets only the listed keys (e.g. agent-status);
  - roles 0, so non-transferable.
- **renew:** live names only. **revoke:** unregister.

**Note: my earlier "text-only, no addr" decision was NOT applied.** ens kept `addr(60) = holder`, pinned. Judge that choice adversarially:
- Can a stolen controller key mint `pay.t<n>.payee.eth` → the thief's address, and would wallets or users treat it as payable? The label rules don't forbid `pay`.
- How does it interact with the root-node default-record issue you fork-confirmed? The holder now holds text-setter roles on its own resolver instance: can it write under `\x00` so deeper names answer?
- Does the dispute freeze darken existing names, or only freeze new issuance?
Run your poc3 harness against the real contracts on the fork, with PoCs for anything you find. Verdict: ship / fix first. Read-only.

### Sat 17:03 JST: Thanks — fix design sent to ens; please re-review when committed

An excellent review; the PoCs made the decisions easy. I sent ens the final design:
- text-only (no addr, no primary name, `name`, `url` and `avatar` reserved);
- a Meigi gating resolver (exact-name only, live Active, epoch, blocked and expiry checks; darkens on dispute);
- the holder gets no resolver roles (`gate.setStatus`);
- sticky brake blocks and freeze;
- an epoch reset;
- the ENSIP-15 hyphen rule.
When ens commits, please re-run your full harness (plus new PoCs for the gating resolver: exact-name only, darkening on dispute, stale epoch, blocked labels) and give a ship / fix verdict. Read-only as before.

### Sat 17:18 JST: ens landed M-1/M-2/L-1/L-2 fixes; re-verify

ens has committed the fixes for your v2 findings; please re-verify them with your poc3 harness (skip this if you've already started). 5ff7489 covers issuer binding (M-2), the sticky brake with a block list, and the reserved profile keys (L-2). d65e676 makes the gate answer only when the current namespace is the one attached (M-1), and it widens before adding (L-1) in the gate only. The live PayeeResolver and ClaimedPayeeResolver stay as deployed; they fail closed. Send the verdict to me and to ens, and tell me whether it's "go live" or "fix first".

### Sat 17:25 JST: Review MandateGate 01976b5 (fork vs live vault)

Please review MandateGate at 01976b5 (contracts/src/payments/MandateGate.sol, ~90 lines; its tests are in the same commit). Thanks for the CompanyNamespace verdict; ens is starting that live run now.

**What it is:** the vault's agent becomes the gate. The gate passes payInvoice(uint64,address,uint256,bytes32) through to the live AgentVault only while all three hold:
- registry.isActive(principal);
- names.answers(principal, "ap");
- msg.sender == nameOf(principal, "ap").holder.

The principal is the buyer ハルカ製作所, T4999900000005. The mandate key is the signer's 0xa73b. Rollback is vault.setAgent(0xa73b).

**Please check:**
1. Nothing reaches the vault's payInvoice except the live mandate holder. Consider callers, reentrancy, and the case where names.answers or nameOf reverts or returns junk: does it fail closed?
2. The vault's own checks (vendor, payout, caps, de-dup) still apply unchanged, and the owner path is unaffected.
3. Every way to darken the mandate stops payment at once: revoke, expiry, block, freeze, reset, dispute, controller rotation.
4. holder() semantics for the signer's startup check.
5. The rollback: after setAgent(0xa73b), no stale approvals or state remain in the gate.
6. Gas headroom against the vault's call.

**How:** run it on a Sepolia fork against the live vault 0x87A7…793B. Once ens has deployed CompanyNamespace and Haruka's ap name, use those live addresses (ens will send them).

The verdict goes to me and ens: go or fix first. Nothing goes live before your pass and Karan's video.

### Sat 17:40 JST: Live addresses: verify the deployed CompanyNamespace

CompanyNamespace is live on the Sepolia Beta. ens's 7-name before/after diff is byte-identical, and the vault's agent is still 0xa73b. Please re-point your harness and run a read-only live check.

**Addresses**
- gate: 0x7ECaD5Fd6892270F09D91aB296786186C5bC660A (deploy tx 0x89d53412…068c; brake = Meigi's deployer)
- メイギ商事 namespace: 0x50639a98B1a09de1E795a4D42D5bbb9758DF9f95, under t2011001234567.payee.eth
- ハルカ製作所 namespace: 0x0f58aC107C5CbFfcFB2b9a02C036C187589CE434, under t4999900000005.payee.eth
- Haruka controller: 0xE39aB1eFe5031076F2AB1166a68134985a99f49a
- Haruka payout: 0x0F4a82D94eA3a4F207ECd0EBAF475acd68190D39
- ap.t4999900000005.payee.eth: held by 0xa73b until 2026-12-31
- Every tx is in docs/ens.md at 491e8b1.

**Please check**
1. The deployed runtime bytecode matches d65e676's build, allowing for immutables and metadata.
2. The live role setup is as designed:
   - nobody holds ROLE_SET_RESOLVER;
   - token roles are 0;
   - the brake is only the deployer;
   - each issued name's resolver is the gate;
   - both namespaces are attached under the right claimed names.
3. The four issued names answer through the canonical UR, text-only and exact.
4. Your MandateGate fork suite passes against the LIVE CompanyNamespace and Haruka's live ap name, instead of a fork copy.

Also: ens has an uncommitted MandateGate change (the constructor check `names.registry() == vault.registry()`, plus deploy asserts). Re-run your 27 once it's committed, then send me the verdict.
