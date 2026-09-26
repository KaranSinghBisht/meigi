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
7. On `/change/T7999900000002`: pick **payout change**, request a new address, and approve it from the **same**
   phone/session with Selfie Check again.
   - **We check:** the verifier log shows the signed approval; the UI shows "1 of 1 approvals" before the
     "Quorum reached" notice appears.
   - Tap **"Queue it with the controller wallet."** This is the one real transaction Karan's own wallet sends —
     confirm it needs a moment to mine, then shows "Queued on-chain. It lands in 72 hours unless cancelled,"
     with a tx hash.
   - **We check:** the registry explorer shows the pending change and its countdown, but not the new address
     (it only resolves once the 72h timelock lands).
8. Have a second person (or a second World App session on a different phone) try to approve the **same**
   request from the "someone who isn't an enrolled officer" row. Confirm the verifier refuses it (not the same
   human who enrolled) and nothing new is queued.

## What worldui captures for the record

No private keys, no World ID session tokens beyond their public session id, no personal data:

- the verifier's exact JSON responses for opening the intent and both approvals (session ids, the signal
  string, nonce, deadline, threshold/approvals count);
- both transaction hashes (registration, payout-change queue) and the block each landed in;
- the exact UI copy at each stage ("1 of 1 officers", "Quorum reached...", "Queued on-chain...");
- the refusal message from step 8, verbatim.

This becomes the recorded run `/change`'s hosted page replays, the same way `apps/web/src/features/x402`
replays a real settled run today.

## After

`scripts/world-live.sh --staging` returns both services to today's default (staging, `proof_of_human`), or
`--stop` to stop them. The queued payout change from step 7 is real and public: it either lands after 72 hours
or gets cancelled deliberately — worth deciding which before submission judging.
