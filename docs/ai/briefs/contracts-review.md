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
