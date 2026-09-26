# World ID for Agents: a different human refused, then a real approved payment

The denied path is in [`world-agents-deny-run.md`](world-agents-deny-run.md). This run shows the other two live
outcomes on the same invoice, on 2026-09-26:
- a proof from a **different human**, refused with nothing paid;
- the **enrolled approver's** proof, which paid on Sepolia.

The setup:
- The agent ran on `:8788` and its signer on `:8796`, on chain 11155111 (Sepolia), against the World ID for Agents
  sandbox IdP.
- The signer verified approvals itself (Phase 2). It paid through the ENS MandateGate, under the buyer company's
  mandate `ap.t4999900000005.payee.eth`.
- The signer had started at 21:22:03 JST.

Every entry quoted below is from the agent's hash-chained audit log (`data/agent/audit-11155111.jsonl`). The log
holds no ID token and no `sub`: an approver appears as the first 16 hex of SHA-256(sub).

## The invoice

Demo document 07, the urgent invoice (至急):

| Field | Value |
|---|---|
| Invoice number | MS-2026-0931 |
| Payee | 株式会社メイギ商事, T2011001234567 |
| Amount | ¥55,000 |
| Paid to | its registered payout `0x9B4f…47e4` |

The analysis (audit #77, 13:14:27Z) held it on triage alone, a hold a verified human may release:
```json
{"seq": 77, "event": "analysis", "invoiceNumber": "MS-2026-0931", "amount": "¥55,000", "decision": "hold",
 "reasons": [
   {"code": "triage_hold", "message": "System-1 triage (kev-latest) holds it: p_safe 0.64 is below 0.9; asks to pay a new account or wallet (13%); suspicion 0.73 of 3."},
   {"code": "pressure_hold", "message": "This request pushes for a fast payment (System-1 pressure 100%)."}],
 "warnings": ["urgent_language"], "screening": {"status": "ok", "flagged": []}, "approvable": true}
```

## 1. A different human is refused (about 22:15 JST)

Karan approved from his phone's browser. That browser was signed in as a different sandbox identity from the one
enrolled as approver. World's page showed the user code `GC8TN-9SZCR` (sandbox reference ending `…68320746`).

```json
{"seq": 78, "at": "2026-09-26T13:14:32.183Z", "event": "approval.started", "approvalId": "07c5141f-3862-477b-9429-ce2d4817d2d6",
 "bindingSha256": "fa2238decbc2b78786c1224c35d61cdc8cba0c69584a809e351423741b63fa1a", "expiresAt": 1790429671}
{"seq": 79, "at": "2026-09-26T13:15:00.645Z", "event": "approval.settled", "approvalId": "07c5141f-3862-477b-9429-ce2d4817d2d6",
 "status": "wrong_human", "reason": "a different person proved than the approver on file"}
```

The console showed: **"Not approved: nothing was paid. The proof came from a different human than the enrolled
approver."**

Nothing was broadcast:
- The log has no `signer.simulate` or `signer.pay` entry between this attempt and the next one (#80). The agent never
  asked the signer to pay.
- The agent key's next transaction on Sepolia, nonce 7, is the approved payment below. It was the key's first
  transaction since the pair restarted at 21:22.
- The invoice stayed held, and the refused attempt left nothing that could authorise a payment.

## 2. The enrolled approver approves, and it pays (22:16-22:17 JST)

Karan then approved in the enrolled desktop Brave. The new attempt is bound to the same analysis (the same
`bindingSha256`):

```json
{"seq": 80, "at": "2026-09-26T13:16:47.352Z", "event": "approval.started", "approvalId": "0fb6f067-541d-4211-9bc9-fe29d6f900c8",
 "bindingSha256": "fa2238decbc2b78786c1224c35d61cdc8cba0c69584a809e351423741b63fa1a", "expiresAt": 1790429806}
{"seq": 81, "at": "2026-09-26T13:16:58.451Z", "event": "approval.settled", "approvalId": "0fb6f067-541d-4211-9bc9-fe29d6f900c8",
 "status": "approved", "approvedAt": 1790428611, "approver": "matched", "approverId": "92c520d9a85b4ec1"}
{"seq": 82, "at": "2026-09-26T13:16:58.843Z", "event": "signer.simulate", "signerId": "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68",
 "invoiceRef": "0xec24d6343b73ab277ccbe9acb195b3bb2190c71a88415502da7df7d2e305fa0f",
 "simulation": {"ok": true, "payout": "0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4"}}
{"seq": 83, "at": "2026-09-26T13:17:01.366Z", "event": "signer.pay", "signerId": "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68",
 "approval": true, "outcome": "sent", "txHash": "0xf7507446d11c2c5cab94ff4b7ca83db36180b3aa8d80085f9556aaeabcea5a03",
 "approvalVerified": true, "approverId": "92c520d9a85b4ec1"}
{"seq": 84, "at": "2026-09-26T13:17:01.367Z", "event": "payment", "mode": "approved", "status": "pending",
 "txHash": "0xf7507446d11c2c5cab94ff4b7ca83db36180b3aa8d80085f9556aaeabcea5a03"}
{"seq": 85, "at": "2026-09-26T13:17:13.686Z", "event": "payment", "mode": "approved", "status": "paid",
 "txHash": "0xf7507446d11c2c5cab94ff4b7ca83db36180b3aa8d80085f9556aaeabcea5a03", "blockNumber": "11786455", "amount": "¥55,000"}
```

The two sides agree on who approved:
- the agent matched the proof to the enrolled approver (#81);
- the signer verified the same approval itself and named the same approver, `92c520d9a85b4ec1` (#83).

On Sepolia:
- Transaction [`0xf7507446…5a03`](https://sepolia.etherscan.io/tx/0xf7507446d11c2c5cab94ff4b7ca83db36180b3aa8d80085f9556aaeabcea5a03),
  block 11786455, at 22:17:12 JST.
- It went from the agent key `0xa73b…BA68` to the MandateGate `0x591d…83BF`, with nonce 7.
- Its logs are the token's `Transfer` of 55,000 × 10¹⁸ from the vault `0x87A7…793B` to `0x9B4f…47e4`, and the
  AgentVault's `InvoicePaid`.
- `invoicePaidAmount(2011001234567, keccak256("T2011001234567|MS-2026-0931"))` is now 55,000 × 10¹⁸, so the vault
  refuses that invoice number from now on.

## What the signer checked in Phase 2

The amount is below the signer's ¥150,000 ceiling, but Phase 2 verifies, and spends, any approval the agent
presents, whatever the amount. Before signing, the signer (`services/signer/src/verify.ts`) checked that the ID
token met every one of these:
- **Signature:** signed by the World ID provider (RS256, keys fetched from the issuer's own origin), for our issuer
  and for our client alone.
- **Form:** in canonical form, since a re-spelt copy of a spent token is refused.
- **Assurance:** Orb-level (`acr`).
- **Freshness:** at most 10 minutes old.
- **After the restart:** made at least 60 s after the signer started. It was approved at 22:16:51 JST, against a
  signer start of 21:22:03, so a restart can't revive an approval spent before it.
- **Approver:** from an approver in the signer's own list (`SIGNER_APPROVERS` in `.env.signer`), which nothing the
  agent writes can add to.
- **Single use:** unspent. It was then reserved for this payment only: T2011001234567 with invoiceRef `0xec24…fa0f`,
  the invoice as the vault keys it.

It then simulated the payment inside its nonce lock (#82), signed it once, and broadcast it (#83).

The agent had already checked the approval first:
- that the proof came from the enrolled approver (the check that refused the phone's proof in step 1);
- that it was bound to this analysis.

## The audit chain

`GET /audit?verify=1` after the run: `{"ok": true, "entries": 85}`.

## Afterwards

MS-2026-0931 is spent for good. `pnpm --filter @meigi/agent demo:renumber` moved demo 07 to MS-2026-0932, the next
number that no document uses and the vault hasn't paid (commit `de98f62`). 01 (MS-2026-0917) is unpaid and kept.
