# fix-verify: Verify security fixes against PoCs

Agent type `oh-my-claudecode:security-reviewer`, started Sat 03:18 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

Independently verify that a set of security fixes actually close the reported findings. Read-only on project files. You may create and modify files only inside the scratch copy described below.

Project: <workspace>/meigi/contracts (Foundry, OpenZeppelin 5.4). The fix commit is `07b7d4f` ("fix(contracts): address security review findings"). See `git -C <workspace>/meigi show 07b7d4f --stat` and read src/ afterwards.

A previous reviewer wrote proof-of-concept tests against the pre-fix code in a scratch copy:
/private/tmp/claude-501/-Users-kryptos-Desktop-Projects-ethtokyo/180544df-5a1b-41ff-ac6b-5dc3ed10bf56/scratchpad/poc (files test/poc/RegistryPoC.t.sol, VaultPoC.t.sol, ResolverPoC.t.sol, TokenRouterPoC.t.sol).

Do this:
1. Copy the current contracts/src and contracts/test/utils into that scratch copy, replacing its old versions.
2. Adapt each PoC to the new API, keeping the attack intent, and run them. After a correct fix, each PoC's attack should now fail; assert that.
3. Report per finding: FIXED / PARTIAL / OPEN, with evidence (the test name and result), plus anything NEW the fixes introduced.

The original findings:
1. [High] Officers alone could take over a payee: rotateController was instant, uncallable by the business key's cancel, and chained with updateOfficers.
2. [High] One attester could redirect any payee. Also, revoking an attester didn't void the changes it had already queued.
3. [High] The owner could rewrite any payee instantly: setAttester(self) → fileDispute → resolveDispute.
4. [Medium] The nonce wasn't bumped on dispute or resolution, so a phished approval replayed after restoration.
5. [Medium] AgentVault followed any registry redirect with no pin of its own.
6. [Low] payoutOf failed open for disputed payees.
7. [Low] The resolver didn't check the parent name.
8. [Low] The meigi.pending text record published an unconfirmed address.
9. [Low] Lowering capPerPeriod below the amount spent caused a panic.
10. [Low] Invoice dedup ignored the amount, so 1 wei burned an invoice reference.
11. [Low] The fixed 30-day window allowed 2× the cap (documented, not fixed by design).

API changes:
- OfficerApproval.nullifiers → officerIds.
- rotateController → requestControllerRotation (queued) + cancelControllerRotation.
- resolveDispute queues; finalizeDispute applies it.
- Queued changes store their approving attester and only count while that attester is still one.
- The nonce bumps on cancel, dispute and rewrite. payoutOf returns 0 unless Active. renounceOwnership is disabled.
- PayeeResolver(registry, parentDnsName). meigi.changePending replaces meigi.pending.
- AgentVault pins the payout at approveVendor and reverts VendorPayoutChanged. It records invoice amounts, and only the owner may top up a paid ref.

Be concrete and brief. Skip style.

## Follow-up instructions

### Sat 03:51 JST: Round 3: verify NEW-1..5 fixes (389f7ef)

Thanks, excellent report. Round 3: please verify the fixes for your NEW-1..NEW-5 in commit 389f7ef (<workspace>/meigi/contracts). Same rules: read-only on the project; copy src/ and test/utils into your scratch copy and adapt your NewIssuesPoC tests.

What changed:
- **NEW-1/2 (attester lifecycle):**
  - `setAttester(x, false)` records `revokedAt[x]` and reverts NotAttester if x isn't active. `setAttester(x, true)` reverts AttesterRevoked if x was ever revoked.
  - A queued change counts iff `isAttester[by] || effectiveAt <= revokedAt[by]` (`OfficerQuorum._approvedBy`).
  - cancelPayoutChange / cancelControllerRotation clear voided entries too.
- **NEW-3 (rogue officer):** updateOfficers no longer reverts RotationPending; it consumes the approval, then `_dropRotation`. requestPayoutChange still reverts RotationPending.
- **NEW-4:** `dismissDispute(t)` (onlyOwner) instantly restores a Disputed payee to Active, untouched, bumps the nonce and clears the staged resolution.
- **NEW-5:** `approveVendor(t, expectedPayout, capPerPayment, capPerPeriod)` requires expectedPayout != 0 and equal to the registry payout.
- **Misc:** remainingInPeriod returns 0 if the registry is inactive or redirected; isInvoicePaid is removed; the constructor enforces changeDelay >= 1h.

Report per issue (FIXED / PARTIAL / OPEN) plus anything new. v2 is already deployed from 389f7ef, so if something is wrong, tell me how bad it is and whether it needs a v3.
