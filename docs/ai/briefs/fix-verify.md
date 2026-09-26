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

### Sat 14:55 JST: Security review: new Worker /api/settlements (MultiBaas key)

New review, before I deploy. apagent added a server-side surface to the public site's Cloudflare Worker. It holds the MultiBaas API key as a Worker secret.
- Commits: **4afeedb** (worker/index.ts, wrangler.landing.jsonc with `run_worker_first: ["/api/*"]` + ASSETS binding, worker tests) and **68449d0** (web client `lib/api/settlements.ts`, `features/settlements/` panel). Docs: 6d94a9f.
- Endpoint: `GET /api/settlements[?tNumber=T…]`. It reads MultiBaas saved queries plus the `payeeOf`/`decimals` contract reads, and returns rows.

Please check, adversarially:
1. **Key exposure:** can the key reach the client, logs, error bodies, the bundle, or any non-`*.multibaas.com` host (SSRF, redirects, host confusion like `evil.multibaas.com.attacker.net`)?
2. **Input handling:** tNumber validation; any request data flowing into upstream paths or queries.
3. **Abuse and cost:** can a visitor force many upstream calls, e.g. iterating valid-format T-numbers past the cache, and burn the MultiBaas free plan's limits for everyone? If so, recommend the cheapest fix, e.g. filter from the cached full list, or only allow T-numbers in `SETTLEMENT_PAYEES`.
4. **Errors:** generic, with no upstream text or stack.
5. **Routing:** SPA routes and assets still served; 404/405 behave; no CORS headers that widen access unnecessarily.
6. The web panel parses defensively; no XSS via names or labels from upstream data (React escaping, no dangerouslySetInnerHTML).
Run `pnpm test:worker` and the typecheck. Report findings by severity with file:line, and a verdict: ship / fix first. Read-only: don't edit, just report to me.

### Sat 15:16 JST: Re-check settlements fixes d646c80 + 7cbc60a

apagent fixed your settlements findings in **d646c80** (agent: saved-query filters) and **7cbc60a** (web Worker). Its summary:
- scope = SETTLEMENT_PAYEES + vault/router payees, capped at 20; an unknown T-number returns [] with 0 upstream calls;
- router query filtered token == mJPYC inside MultiBaas, and the Worker checks it too;
- transfers pinned to sender == the x402 research agent (X402_BUYER), filtered in MultiBaas, with the recipient checked in the Worker; relabelled "x402 purchase by the research agent";
- 60 s poll, a 3-min Cache API snapshot per data centre plus 30 s per isolate, max-age=60, the cache key includes the scope;
- 405 Allow and nosniff; `.dev.vars*` ignored.
Your original harness fails 2 "show the bug" tests because its mock lacks the new token-alias read (the Worker fails closed). apagent made a copy with that one mock route at `<scratchpad>/settlements-review/review-after-fix.test.ts`: check that copy is fair and didn't weaken any assertion.

Please re-verify, adversarially:
1. Is the High closed, including cold-isolate fan-out ≤ 50 and the 20-payee cap?
2. Can fake rows still appear? Consider: the router's token filter (can a fake token spoof the mJPYC alias check?); the pinned sender (what if the X402_BUYER wallet itself were compromised? just note it); whether the recipient check can be bypassed.
3. Is fail-closed behaviour sane (503, not an empty feed that looks real)?
4. Are the Cache API keys safe: no cross-scope poisoning, no key or secret in the cache key?
Verdict: ship / fix first. Read-only.

### Sat 15:36 JST: Heads-up: git history rewritten; all hashes changed

Heads-up: at 15:33 I rewrote the repo's history, with Karan's go-ahead, to drop three internal prep docs from every commit, and force-pushed main. **Every commit hash changed.** Trees are identical, so your review conclusions stand. main = origin/main = 12f8e40. For any review target, find the new hash by subject: `git log --oneline --grep "harden the settlements API"` and so on. The next review request will use new hashes.

### Sat 16:10 JST: Combined settlements re-check: cost fix + 7a6db95 (new hashes)

Round 3 on the settlements Worker, before I deploy. Commits (current hashes): **78ec07c** ("a settlements refresh costs 3 MultiBaas calls; a wrong token or buyer setting answers 503") and **7a6db95** (a shared snapshot is never reused past its 3-min window). apagent's summary:
- a refresh costs 3 calls (the test pins [9,3,3,3,6,3,3,3,6,3] over 10 refreshes 181 s apart);
- payeeOf cached 10 min; the alias, decimals and indexedFrom 1 h;
- a new required `SETTLEMENT_TOKEN`: missing or malformed → 503; the `meigi_mjpy` alias ≠ the token → 503 (checked before any query);
- edge copies are row-validated; the edge key is v3 and includes the token.
Three of your round-2 cases changed intentionally (the silent misconfigs → 503; junk under the edge key refused; the post-outage stale window is now ≤180 s). apagent's patched harness copies are in `<scratchpad>/settlements-review/*-costfix.test.ts`; check they're fair, as last time.

Verify adversarially: is the cost bound real (including cold isolates, the Cache API as a no-op on workers.dev, and many isolates)? Is the 3-min staleness cap enforced everywhere? Does 503-on-misconfig leak nothing? Can the edge cache be poisoned via the v3 key? Verdict: ship / fix first. Read-only.

### Sat 16:24 JST: Review "Ask the ledger" (3a61d21, 9707814) before deploy

New review, which blocks the next deploy because the code is now in HEAD. **"Ask the ledger"**: commits **3a61d21** (Worker, `POST /api/ask`) and **9707814** (UI in the settlements panel). It's a public LLM endpoint on the site Worker, via a Workers AI binding (llama-3.3-70b), grounded only in the settlements snapshot.

Files: `apps/web/worker/ask.ts`, `ask-guard.ts` (answer validation), `ask-prompt.ts`, `ask-quota.ts` (SQLite DO daily cap), `wrangler.landing.jsonc` (ai binding, the ratelimit binding at 3/60 s, the DO migration, ASK_DAILY_CAP). Tests: `cd apps/web && pnpm test:worker` (29).

Verify adversarially:
1. **Prompt injection:** via the question, and via on-chain data in the rows (legal names come from the registry). Can a visitor make it output arbitrary text, other numbers, addresses or links? Is the guard's allow-list tight, and can it be bypassed (unicode digits, spelled-out numbers, markdown links)?
2. **Abuse and cost:** the per-IP limit, the global daily cap (can the DO be raced or bypassed?), and 2KB body and 300-char limits. What if Workers AI is exhausted (4006)?
3. **Output handling:** is it plain text only in React, with citations limited to real rows?
4. **Errors and logging:** generic errors; nothing a visitor typed is logged.
5. **Kill switch:** is there an `ASK_ENABLED` flag defaulting to **off** in production (I asked webapp for one)? If not, flag it; it must ship off until the live smoke test after 09:00 JST.
Verdict: ship / fix first. Read-only.

### Sat 17:00 JST: Re-review Ask the ledger: intent-only redesign + hardening

Ask the ledger, round 2 (it stays OFF in production until you pass it and the 09:00 smoke test runs). Commits:
- **257277d**: "Ask the ledger computes every answer from the rows; the model only reads the question". The model returns only `{intent, params}` from a fixed enum; the Worker computes the answer deterministically and renders it from templates; model text is never shown.
- **6137d2c**: "harden Ask the ledger: same origin, JSON, 2 KB, a /64 per asker, 5 a day each, refunds".
Please verify:
1. The injection surface is really gone: can any model output reach the visitor as text, a number, an address or a link? Are params validated against in-scope payees and ISO dates?
2. Your earlier abuse findings are closed: content-type and origin, IPv6 /64 keying, the per-IP daily cap, the body cap before the read, quota taken only after validation and refunded on failure, GET not hitting the DO per call.
3. The cost per question (the prompt should now be the question plus payee names only).
4. The kill switch is still off by default.
Also cross-check **7f247d1** and **01ebf8d** (workers/ai-proxy: a hard daily neuron budget so Workers AI can never bill the paid plan). Karan is worried about surprise bills, so confirm the budget truly caps spend: the counting, the worst-case reservation, and settling to reported neurons. Verdict: ship-on / fix first. Read-only.

### Sat 17:06 JST: Add 8d930f4 (Ask neuron budget) to the Ask round-2 review

Add **8d930f4** to your Ask round-2 review: "Ask the ledger keeps a hard daily neuron budget" (worst-case reservation per call against ASK_DAILY_NEURONS=3000; failed calls keep their reservation). Together with ai-proxy's 6,000, the account stays under the free 10k, so Karan's paid plan never bills; please confirm that holds. webapp reports a live smoke test with the flag on locally: 20/20 correct, and all 6 injection prompts refused. It stays OFF in production until your verdict.

### Sat 17:18 JST: Rollover guards landed; re-check Ask

The rollover guards have landed; please re-check them (ignore this if you're already on it). The commits are 0c24cf3 (web ask-quota), 05c5f0c (ai-proxy budget plus a model-call timeout), 87a0d38 (the agent refuses direct Cloudflare paths that bypass the proxy budget) and d512d8e (the Ask disclosure line). Send me your verdict on Ask. ASK_ENABLED stays "false" until you pass it and the live smoke test after 09:00 JST succeeds. I'm redeploying the site now with Ask still off, so the guard goes live either way.
