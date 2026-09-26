# The real World ID phone run

One real run, in the **World ID** app's **production** environment with **Selfie Check**, against the fictional
company
T7999900000002 (registry office 9999: provably not a real NTA corporation). It does two things at once:
registers a company and queues a payout change, both gated by World ID, on Sepolia; and produces the real data
the hosted `/change` page replays. About 10 minutes once everything below is ready.

Never share the QR code or session link from a screenshot: whoever completes it becomes the enrolled officer.

## Before Karan starts

- [ ] Karan has the **World ID** app (not "World App" — World split verification into its own app) from the App
      Store, signed in, and has completed a Selfie Check in it at least once before (so it isn't also debugging
      World's own onboarding during the run).
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
5. **"Your officers":** tap enroll, open the QR/session, then **decline or cancel from inside the World ID app
   itself** once, before completing it for real — an alternative path Karan can do alone, no second phone
   needed (the IDKit prize wants a success path plus one alternative path).
   - **We check:** the panel closes and shows a plain, calm line — "Declined. Nothing was added." (declined in
     the app) or "Cancelled. Nothing was added." (backed out, or cancelled from our own Cancel button) — not a
     red error. Tap the same button again immediately: it starts a fresh request with no leftover state.
   Then tap enroll again, scan the QR with the **World ID** app for real, complete Selfie Check on the phone.
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
      ID," open the QR/session, then **cancel from inside the World ID app itself** (decline, or back out) once.
      - **We check:** the panel closes and shows a plain, calm line — "Declined. Nothing was approved." or
        "Cancelled. Nothing was approved." — not a red error. This is `apps/web/src/lib/world/rpContext.ts`'s
        `widgetOutcome()`: every client-side World ID code (declined, cancelled - including our own Cancel
        button, and a genuine SDK timeout) renders as a muted status line naming what didn't happen, not an
        alert.
      - Tap the same button again immediately: it must start a fresh request with no leftover state.
   2. **The wrong human (alternative path b) — deferred.** Adithya is out until tonight, so this happens later as
      its own mini-step (not blocking the rest of this run): from the "someone who isn't an enrolled officer"
      row, he proves with his own World ID against the same still-open request (or a fresh one, if this one has
      since resolved). **We check:** the verifier refuses it (not the same human who enrolled) and nothing is
      queued.
   3. **The real approval.** Karan approves for real from the same phone/session with Selfie Check.
      - **We check:** the verifier log shows the signed approval; the UI shows "1 of 1 approvals" before the
        "Quorum reached" notice appears.
   Tap **"Queue it with the controller wallet."** This is the one real transaction Karan's own wallet sends —
   confirm it needs a moment to mine, then shows "Queued on-chain. It lands in 72 hours unless cancelled," with
   a tx hash.
   - **We check:** the registry explorer shows the pending change and its countdown, but not the new address
     (it only resolves once the 72h timelock lands).
8. **Cancel the queued payout change, via the controller (alternative path c).** On the registry page for
   T7999900000002 (or `/change/T7999900000002`), the pending-change banner now shows a **"Cancel with your
   wallet"** button whenever the connected wallet is the controller (`CancelPayoutChange.tsx`, `70a5e71`) — Karan
   taps it, his wallet sends `cancelPayoutChange(tNumber)` **directly**, no officer approval and no attester
   involved. (The registry's `_requireCanceller` allows the controller, an attester or governance; this is the
   controller exercising that on their own — separate from the officer-quorum-then-attester `CancelPayoutChange`
   intent in `ActionPicker`, which still exists but isn't used for this step.)
   - **We check:** the button only appears for Karan's own wallet; after confirming, the banner clears and the
     registry no longer shows a pending change; the tx is Karan's wallet, not the attester's.
9. **Queue a fresh change and leave it pending, through judging.** Repeat step 7's request (a different new
   address this time; skip the cancel/wrong-human sub-steps) and have Karan approve for real. **Do not cancel
   this one.** landing's `/business` withdrawal check and the registry's pending banner both need a real,
   currently-live "change pending, hold" example.
   - **We capture:** the queue tx's block, then `cast block <n> --rpc-url $SEPOLIA_RPC_URL -f timestamp` for its
     landing time = that timestamp + 259200 (72h) — write the exact value into "What worldui captures" below
     once known. After judging, Karan can let it land or cancel it (with his wallet, same button as step 8).

## What worldui captures for the record

No private keys, no World ID session tokens beyond their public session id, no personal data:

- the verifier's exact JSON responses for opening the intent and every approval attempt (session ids, the
  signal string, nonce, deadline, threshold/approvals count);
- every transaction hash (registration, both payout-change queues, the controller's cancel) and the block each
  landed in;
- the exact UI copy at each stage ("1 of 1 officers", "Declined/Cancelled. Nothing was added/approved.",
  "Quorum reached...", "Queued on-chain...", "Cancelled by the controller...");
- the wrong-human refusal message, verbatim, once Adithya's deferred mini-step happens;
- **step 9's landing time:** queue tx block `TODO`, block timestamp `TODO`, lands at `TODO` (timestamp + 259200).

This becomes the recorded run `/change`'s hosted page replays, the same way `apps/web/src/features/x402`
replays a real settled run today.

## After

`scripts/world-live.sh --staging` returns both services to today's default (staging, `proof_of_human`), or
`--stop` to stop them once judging is over. Step 8 resolves step 7's pending change (cancelled on-chain,
deliberately). Step 9's change is deliberately left running through judging — real, public, on the actual
registry — and only gets cancelled or let land afterward, Karan's call.
