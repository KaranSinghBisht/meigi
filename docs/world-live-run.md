# The real World ID phone run

One real run, in World App's **production** environment with **Selfie Check**, against the fictional company
T7999900000002 (registry office 9999: provably not a real NTA corporation). It does two things at once:
registers a company and queues a payout change, both gated by World ID, on Sepolia; and produces the real data
the hosted `/change` page replays. About 10 minutes once everything below is ready.

Never share the QR code or session link from a screenshot: whoever completes it becomes the enrolled officer.

## Before Karan starts

- [ ] Karan has World App from the App Store, signed in, and has completed a Selfie Check in the app at least
      once before (so it isn't also debugging World's own onboarding during the run).
- [ ] Karan's own wallet (MetaMask or similar) holds a small amount of Sepolia ETH. It signs one real
      transaction later (`requestPayoutChange`), and only that wallet can send it, so this can't be topped up
      mid-run without restarting the officer approval.
- [ ] **worldui, only once team-lead says go:** `scripts/world-live.sh --yes` from the repo root. Confirm both
      lines print "up": the verifier on :8787 and a rehearsal web server on :5190.
- [ ] worldui sends Karan the printed URL (`http://localhost:5190/register`) and stays on the call/chat to
      capture the checks below as they happen.
- [ ] Have `contracts/deployments/11155111.json` (or its `registry` address) and `$SEPOLIA_RPC_URL` handy for
      the `cast call` checks.

## The run

1. Open `/register`. **"Your company":** enter `T7999900000002` and any fictional legal name (e.g. "World Live
   Rehearsal Ltd").
2. **"Your wallets":** connect Karan's wallet as the business key. Click "Create a new payout wallet", then
   save its backup file — the step won't continue until the backup is confirmed (by design: the key would
   otherwise be gone the moment the screen closes).
3. **"Prove your domain":** skip it.
4. **"Prove you represent the company":** skip it too (production's real check is the 商業登記電子証明書, which
   this run isn't built to carry).
5. **"Your officers":** tap enroll, scan the QR with World App, complete Selfie Check on the phone.
6. **"Review and register":** confirm it shows "1 of 1 officers", then tap **Register company**.
   - **We check, right after:**
     - `cast call $REGISTRY "officersOf(uint64)(bytes32[])" 7999900000002 --rpc-url $SEPOLIA_RPC_URL` returns
       exactly one officer id (a bytes32, not personal data — it's `keccak256(session_id)`).
     - The verifier log (`world-live-verifier.log`) shows a verified World ID proof for that session and the
       registration request it approved.
     - A registration transaction appears on Sepolia, sent by the attester (not Karan's wallet) — the app shows
       its hash; confirm it on Etherscan.
7. On `/change/T7999900000002`, pick **payout change** and request a new address. Then, in this order:
   1. **The cancelled proof (alternative path a — cheapest, no second human needed).** Tap "Approve with World
      ID," open the QR/session, then **cancel from inside World App itself** (decline, or back out) once.
      - **We check:** the panel closes and shows a plain, calm line — "Cancelled. Nothing changed — try again
        when you're ready." — not a red error. This is `apps/web/src/lib/world/rpContext.ts`'s `widgetOutcome()`
        (fixed for this run in `80fd408`: `user_rejected`/`cancelled` now render as a muted status line, not an
        alert).
      - Tap the same button again immediately: it must start a fresh request with no leftover state.
   2. **The wrong human (alternative path b) — only if Adithya's World App is available.** From the "someone who
      isn't an enrolled officer" row, have Adithya prove with his own World ID.
      - **We check:** the verifier refuses it (not the same human who enrolled) and the approval count stays at
        0 of 1 — nothing is queued.
   3. **The real approval.** Karan approves for real from the same phone/session with Selfie Check.
      - **We check:** the verifier log shows the signed approval; the UI shows "1 of 1 approvals" before the
        "Quorum reached" notice appears.
   Tap **"Queue it with the controller wallet."** This is the one real transaction Karan's own wallet sends —
   confirm it needs a moment to mine, then shows "Queued on-chain. It lands in 72 hours unless cancelled," with
   a tx hash.
   - **We check:** the registry explorer shows the pending change and its countdown, but not the new address
     (it only resolves once the 72h timelock lands).
8. **Cancel the queued payout change (alternative path c — also settles what to do with a real pending change).**
   On-chain, only the controller, an attester or governance can cancel (`PayeeRegistry._requireCanceller`) — not
   any officer directly. Two ways to exercise that here; we use the second:
   - Karan's controller wallet could call `cancelPayoutChange` itself, the same way it called
     `requestPayoutChange` in step 7 — but our UI has no button for that today, only a raw `cast send`.
   - **What we actually do:** back on `/change/T7999900000002`, pick **"Cancel the pending payout change."** This
     is the verifier's `CancelPayoutChange` intent, whose approval threshold is hard-coded to 1 regardless of
     the company's normal quorum (`services/verifier/src/routes/intents.ts`). Karan, the one enrolled officer,
     approves with Selfie Check once more; the **attester** (not Karan's wallet) then calls `cancelPayoutChange`
     on-chain — it's one of the three addresses the contract allows, same as the controller would be.
   - **We check:** the UI shows "Done. The attester executed it on-chain." with a tx hash, and the registry no
     longer shows a pending change.
9. **Optional — leave a fresh pending change (Karan decides at run time).** If there's appetite for judges to
   see a *live* 72h countdown rather than only a replay, repeat step 7 once more (skip the cancel/wrong-human
   sub-steps) and queue a new change, and deliberately leave this one to run its course rather than cancelling
   it.

## What worldui captures for the record

No private keys, no World ID session tokens beyond their public session id, no personal data:

- the verifier's exact JSON responses for opening the intent and every approval attempt (session ids, the
  signal string, nonce, deadline, threshold/approvals count);
- every transaction hash (registration, payout-change queue, payout-change cancel) and the block each landed in;
- the exact UI copy at each stage ("1 of 1 officers", "Cancelled. Nothing changed...", "Quorum reached...",
  "Queued on-chain...", "Done. The attester executed it on-chain...");
- the wrong-human refusal message from step 7.2, verbatim, if Adithya took part.

This becomes the recorded run `/change`'s hosted page replays, the same way `apps/web/src/features/x402`
replays a real settled run today.

## After

`scripts/world-live.sh --staging` returns both services to today's default (staging, `proof_of_human`), or
`--stop` to stop them. Step 8 already resolves what to do with the pending change from step 7 (it's cancelled
on-chain, deliberately, as part of the run) — unless step 9 happens, in which case that second change is real
and public and left running on purpose.
