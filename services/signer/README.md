# @meigi/signer: the only process with the agent key

The AP agent ([`services/agent`](../agent)) reads invoices, reasons about them with models and decides. It holds no key.
This small process holds the AgentVault's agent key and signs one call for it: `AgentVault.payInvoice`.

- **Typed fields only.** `tNumber`, `payout`, `amount` and `invoiceRef`. The signer builds the calldata itself;
  unknown fields are refused, so arbitrary calldata can't get through.
- **Simulated first, every time.** `/pay` re-simulates inside the nonce lock and broadcasts only if that passes. An
  invoice whose payment is in flight is never sent twice.
- **Signed once, broadcast carefully.** The signer signs the transaction locally and knows its hash before sending
  it (`broadcast.ts`).
  - A transport error on `SEPOLIA_RPC_URL` (a timeout, a connection error, a Cloudflare 403) is settled by asking
    both RPCs for that hash. If neither has it, the same bytes go to `SEPOLIA_RPC_FALLBACK_URL`.
  - "Already known", or a nonce collision on that very hash, counts as sent.
  - Any other refusal is final: nothing is signed again.
  - Reads fall back to the second RPC too.
- **Its own rule, whatever the agent decided.** Above `SIGNER_HUMAN_ABOVE_YEN` (¥150,000), it signs only with a World ID
  for Agents approval: an Orb-level ID token, at most `SIGNER_APPROVAL_MAX_AGE_S` (10 minutes) old, from the
  configured issuer and client. The agent forwards the approving token once, when a verified human has released the
  hold.
  - Who verifies what: the agent always verifies the approval (signature, issuer, audience, Orb level, freshness,
    approver; see its README). The signer verifies it again, independently, once Phase 2 is on.
  - Phase 1 (`SIGNER_VERIFY_APPROVAL=0`, the default) only decodes the token's claims (jose `decodeJwt`), above the
    ceiling only, and trusts the agent's verification for the rest.
  - Phase 2 (`SIGNER_VERIFY_APPROVAL=1`; needs `WORLD_AGENTS_ISSUER` and `WORLD_AGENTS_CLIENT_ID`) verifies every
    approval the agent presents, whatever the amount, so the booth's ¥55,000 release is checked here too. Above the
    ceiling one is required. It refuses on the first failure:
    - form and signature: canonical compact form, RS256 against the provider's keys from its discovery document
      (same origin, no redirects);
    - freshness: made after this signer started, so a restart can't revive a spent approval;
    - the approver: `SIGNER_APPROVERS` from `.env.signer` when set, which nothing the agent writes can extend.
      Otherwise the agent's `WORLD_AGENTS_APPROVERS` and its enrolled `data/agent/approvers.json`, read but never
      written;
    - single use: the approval is reserved for the first invoice it clears, (T-number, invoiceRef) as the vault
      keys it, in one step with the check, so concurrent requests can't share it. The reservation is released only
      when the chain's simulation refuses the payment and nothing was broadcast.
  - Keys that can't be fetched fail closed. A local mock IdP (http on loopback) is accepted only on chain 31337.
  - `/health` always says which phase is on (`verifiesApproval: true` or `false`). The kill switch is the variable,
    plus a restart:
    `SIGNER_VERIFY_APPROVAL=1 scripts/ap-stack.sh`.
  - **Limit.** World ID for Agents' device grant carries nothing about the payment. The signer knows the approval is
    genuine, fresh, unspent and from an approver, but not which payment the human was shown: the agent binds that.
- **Localhost and a shared secret.** It listens on 127.0.0.1:8796 only. Every route but `/health` needs
  `Authorization: Bearer <SIGNER_TOKEN>`, compared in constant time.
- **The right key.** At startup it checks on-chain that its key isn't the vault's owner (the owner may pay an invoice
  twice), and that it is the vault's agent, directly or through the ENS mandate (below).
- **An ENS mandate (prepared, off: `SIGNER_VIA_GATE=0`).** The buyer company can issue its AP agent a name,
  `ap.t<company>.payee.eth`, and make the `MandateGate` the vault's agent. The gate forwards `payInvoice` (same
  arguments) only while that name answers and is held by this key.
  - With `SIGNER_VIA_GATE=1` and `MANDATE_GATE_ADDRESS`, the signer sends `payInvoice` to the gate, still typed fields
    only and simulated first.
  - The startup check is strict. The gate must be the vault's agent, forward to this vault, enforce the configured
    mandate (`MANDATE_PRINCIPAL`, `MANDATE_LABEL`, default `ap`; a gate for another company could still name this
    key), and name this key as the mandate's holder. Otherwise the signer refuses to start. Once it is running, a revoked mandate comes back
    as `MandateNotLive`, which the agent shows as a hold.
  - With the default `SIGNER_VIA_GATE=0`, the vault's agent must be this key. The rollback is
    `vault.setAgent(<this key>)`, `SIGNER_VIA_GATE=0`, and a restart.
  - `/health` says which route is in use (`via: "vault" | "gate"`, `gate`). The vault still emits `InvoicePaid`, so
    receipts and indexing are unchanged.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok, agent, vault, chainId, humanAboveYen, via, gate, verifiesApproval }` (no token) |
| POST | `/simulate` | `{ tNumber, payout, amount, invoiceRef }` | `{ ok: true, payout, signer }` or `{ ok: false, revert: { data }, signer }` |
| POST | `/pay` | the same, plus `approval?: { idToken }` | `{ ok: true, txHash, signer, simulation, approval? }` as soon as it's broadcast (`approval: { verified, approverId }` when Phase 2 verified one; `inFlight: true` and no approval when it answers with the invoice's transaction already sent), `{ ok: false, revert, signer }`, or `403 human_approval_required` |
| GET | `/receipt/:txHash` | | `{ receipt: { txHash, status, blockNumber } \| null }` |

A revert comes back as raw data, which the agent decodes against the Meigi ABIs. A chain failure is a generic `502`.
Every answer names the signing key (`signer`). `/pay`'s `simulation` is what its own re-simulation inside the nonce
lock returned (`{ ok: true, payout }`), or null when it answered with the transaction already in flight (an invoice
is one (T-number, invoiceRef) pair, as the vault keys it). The agent
writes both into its hash-chained audit log (`signer.simulate`, `signer.pay`), so the chain covers the signing step.

## Run

```sh
scripts/ap-stack.sh                    # from the repo root: the signer, then the agent, both supervised
pnpm --filter @meigi/signer start      # just the signer: loads ../../.env, then ../../.env.signer
pnpm --filter @meigi/signer dev:local  # against the anvil from `pnpm --filter @meigi/agent local:chain` (:8797)
pnpm --filter @meigi/signer test
```

`.env.signer` sits at the repo root, is git-ignored and chmod 600, and holds `AGENT_PRIVATE_KEY` and `SIGNER_TOKEN`.
The agent's `.env` carries the same `SIGNER_TOKEN` and `AGENT_ADDRESS`, never the key. `contracts/script/ens/ens.sh`
reads the key from `.env.signer` too, for `agent-status`.
