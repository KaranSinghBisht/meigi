# The real World ID phone run — the record

One real run, in the **World ID** app's **production** environment, against the fictional company
T7999900000002 (registry office 9999: provably not a real NTA corporation). It does two things at once:
registers a company and queues a payout change, both gated by World ID, on Sepolia; and produces the real data
the hosted `/change` page replays. About 10 minutes once everything below is ready. **Credential: Orb, not
Selfie Check** — Selfie Check has failed in-app twice already tonight (`docs/world-debrief.md`); don't spend
this run's one shot re-proving that.

Never share the QR code or session link from a screenshot: whoever completes it becomes the enrolled officer.

## Already true, before this run

Two things below already happened tonight, ahead of T7999900000002's actual registration, and are separate from
it — both are recorded in full in `docs/world-debrief.md`:

- **Two real production World ID proofs, Orb, `createSession`** — the first time any of this ran against World
  outside a fixture: officer `0x8b843464…fd8d90` at 19:41 JST, officer `0xdcf809aa…118b6f` at 20:39 JST. Rehearsals,
  neither ever registered on-chain: the actual run below enrolled a third, separate officer.
- **A real `proveSession` request against production.** The pitched officer-approval mechanism (`proveSession`
  re-proving an enrolled session) had never run against World in any form before tonight. Using one of the two
  session ids above, the request built correctly and World returned a live connector URI — the first time this
  code path has been exercised against production. It timed out unscanned (no phone was available to complete
  it); a human completing the scan is the one thing this hasn't yet proven live.

This file is the record of the actual registration-plus-payout-change run below.

## Before Karan starts

- [ ] Karan has the **World ID** app (not "World App" — World split verification into its own app) from the App
      Store, signed in, with access to a physical Orb nearby and at least one prior verification completed on
      it. (Selfie Check has failed in-app twice tonight; Orb is the confirmed-working path — see
      `docs/world-debrief.md`. This is a real logistical requirement, not just an app install.)
- [ ] Karan's own wallet (MetaMask or similar) holds a small amount of Sepolia ETH. It signs one real
      transaction later (`requestPayoutChange`), and only that wallet can send it, so this can't be topped up
      mid-run without restarting the officer approval.
- [ ] **Only once team-lead says go:** `scripts/world-live.sh --yes` from the repo root. Confirm both lines
      print "up": the verifier on :8787 and a rehearsal web server on :5190.
- [ ] Send Karan the printed URL (`http://localhost:5190/register`) and stay on the call/chat to capture the
      checks below as they happen.
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
   Then tap enroll again, scan the QR with the **World ID** app for real, complete verification on the phone
   with **Orb** (Selfie Check is confirmed failing in-app tonight — see the intro).
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
   3. **The real approval.** Karan approves for real from the same phone/session with **Orb**.
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
     landing time = that timestamp + 259200 (72h) — write the exact value into "What this run captures" below
     once known. After judging, Karan can let it land or cancel it (with his wallet, same button as step 8).

## What this run captures for the record

No private keys, no World ID session tokens beyond their public session id, no personal data:

- the verifier's exact JSON responses for opening the intent and every approval attempt (session ids, the
  signal string, nonce, deadline, threshold/approvals count);
- every transaction hash (registration, both payout-change queues, the controller's cancel) and the block each
  landed in;
- the exact UI copy at each stage ("1 of 1 officers", "Declined/Cancelled. Nothing was added/approved.",
  "Quorum reached...", "Queued on-chain...", "Cancelled by the controller...");
- the wrong-human refusal message, verbatim, once Adithya's deferred mini-step happens.

**Filled in from the real run** (2026-09-27 JST; every tx confirmed directly via `cast receipt` against Sepolia
and cross-checked against the verifier's database and `officersOf` on-chain — not copied from a report alone):
- **Step 6 registration.** tx
  [`0x0c297d9cf284e38d572e68ee8e25b4ce79b662247b405b125b41b63d33f0dd6f`](https://sepolia.etherscan.io/tx/0x0c297d9cf284e38d572e68ee8e25b4ce79b662247b405b125b41b63d33f0dd6f),
  block 11,788,318, mined 04:40:24, sent by the attester (`0x3D5F…1049`), status success. Officer enrolled:
  `officerId` `0xb02c5df1…98df0` (Orb) — confirmed alone via `officersOf(7999900000002)` on-chain, exactly one
  officer, matching. Company 株式会社ソラノ精機; controller and initial payout `0x6eaFE9D8…146B57`.
- **Step 7.1 decline: not recorded.** Karan's separate "Replace a lost business key" take (S4b) wasn't recorded
  either; the verifier's database confirms no `ControllerRotation` intent exists for this T-number. The
  payout-change intent stays approve-only, as filled in below. The alternative-path evidence for IDKit is the
  verifier's own test, `services/verifier/test/app.test.ts:164`, `"denies a different human"` — not a live take.
- **Step 7.3 approval + queue.** tx
  [`0x9202080ada84f8f5671e72d84b72d45e510fe748fc636a47f2179b61875c26ea`](https://sepolia.etherscan.io/tx/0x9202080ada84f8f5671e72d84b72d45e510fe748fc636a47f2179b61875c26ea),
  block 11,788,336, mined 04:44:00, sent by the controller wallet (`0x6eaFE9D8…146B57`), status success. Approved
  by the same officer who registered, via `proveSession` (confirmed in the verifier's `intents.approvals`). New
  payout `0x6eafe9d8…146b51`. The registry emitted its own confirming event in the same transaction.
- **Landing time.** Queue tx block 11,788,336, block timestamp 04:44:00 (2026-09-27), lands **04:44:00,
  2026-09-30** (block timestamp + 259200 = 72h) — unless cancelled first.

This becomes the recorded run `/change`'s hosted page replays, the same way `apps/web/src/features/x402`
replays a real settled run today.

## After

`scripts/world-live.sh --staging` returns both services to today's default (staging, `proof_of_human`), or
`--stop` to stop them once judging is over. The payout change recorded above is the one left running through
judging — real, public, pending on the actual registry — and only gets cancelled or let land afterward, Karan's
call. (The original script's steps 7.1 and 8 — a decline and a cancel-then-requeue cycle — weren't recorded
live; the decline's alternative-path evidence is a verifier test instead, see the note above. Step 7.2's
wrong-human refusal, Adithya's deferred mini-step, is unconfirmed either way as of this restart.)
