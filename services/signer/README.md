# @meigi/signer: the only process with the agent key

The AP agent ([`services/agent`](../agent)) reads invoices, reasons about them with models and decides. It holds no key.
This small process holds the AgentVault's agent key and signs one call for it: `AgentVault.payInvoice`.

- **Typed fields only.** `tNumber`, `payout`, `amount` and `invoiceRef`. The signer builds the calldata itself;
  unknown fields are refused, so arbitrary calldata can't get through.
- **Simulated first, every time.** `/pay` re-simulates inside the nonce lock and broadcasts only if that passes. An
  invoice whose payment is in flight is never sent twice.
- **Its own rule, whatever the agent decided.** Above `SIGNER_HUMAN_ABOVE_YEN` (¥150,000), it signs only with a World ID
  for Agents approval: an Orb-level ID token, at most `SIGNER_APPROVAL_MAX_AGE_S` (10 minutes) old, from the
  configured issuer and client. The agent forwards the approving token once, when a verified human has released the
  hold. Below the ceiling the agent's word is enough; the booth's ¥55,000 approval is the agent's own hold.
  - Phase 1 (`SIGNER_VERIFY_APPROVAL=0`, the default) reads the token's claims and trusts the agent to have checked
    the rest.
  - Phase 2 (`SIGNER_VERIFY_APPROVAL=1`, needs `WORLD_AGENTS_ISSUER` and `WORLD_AGENTS_CLIENT_ID`) checks everything
    itself, and refuses on the first failure:
    - the token's RS256 signature, against the provider's keys from its discovery document (same origin, no
      redirects);
    - the approver: a subject in `WORLD_AGENTS_APPROVERS` or enrolled in the agent's `data/agent/approvers.json`,
      which it reads but never writes;
    - single use: once the payment it approved is sent, it approves no other invoice.
  - Keys that can't be fetched fail closed. `/health` says which phase is on (`verifiesApproval`). The kill switch
    is the variable, and a restart: `SIGNER_VERIFY_APPROVAL=1 scripts/ap-stack.sh`.
  - Spent approvals are kept in memory for their 10-minute window, so a signer restart forgets them. The agent also
    spends each approval once.
- **Localhost and a shared secret.** It listens on 127.0.0.1:8796 only. Every route but `/health` needs
  `Authorization: Bearer <SIGNER_TOKEN>`, compared in constant time.
- **The right key.** At startup it checks on-chain that its key is the vault's agent and not the owner (the owner may
  pay an invoice twice).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok, agent, vault, chainId, humanAboveYen, verifiesApproval }` (no token) |
| POST | `/simulate` | `{ tNumber, payout, amount, invoiceRef }` | `{ ok: true, payout, signer }` or `{ ok: false, revert: { data }, signer }` |
| POST | `/pay` | the same, plus `approval?: { idToken }` | `{ ok: true, txHash, signer, simulation, approval? }` as soon as it's broadcast (`approval: { verified, approverId }` when Phase 2 verified one), `{ ok: false, revert, signer }`, or `403 human_approval_required` |
| GET | `/receipt/:txHash` | | `{ receipt: { txHash, status, blockNumber } \| null }` |

A revert comes back as raw data, which the agent decodes against the Meigi ABIs. A chain failure is a generic `502`.
Every answer names the signing key (`signer`). `/pay`'s `simulation` is what its own re-simulation inside the nonce
lock returned (`{ ok: true, payout }`), or null when it answered with the transaction already in flight. The agent
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
