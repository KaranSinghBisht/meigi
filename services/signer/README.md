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
  hold.
  - Phase 1 (today) reads the token's claims.
  - Phase 2 will also verify its signature against the IdP's keys, and the approver, here.
- **Localhost and a shared secret.** It listens on 127.0.0.1:8796 only. Every route but `/health` needs
  `Authorization: Bearer <SIGNER_TOKEN>`, compared in constant time.
- **The right key.** At startup it checks on-chain that its key is the vault's agent and not the owner (the owner may
  pay an invoice twice).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok, agent, vault, chainId, humanAboveYen }` (no token) |
| POST | `/simulate` | `{ tNumber, payout, amount, invoiceRef }` | `{ ok: true, payout }` or `{ ok: false, revert: { data } }` |
| POST | `/pay` | the same, plus `approval?: { idToken }` | `{ ok: true, txHash }` as soon as it's broadcast, `{ ok: false, revert }`, or `403 human_approval_required` |
| GET | `/receipt/:txHash` | | `{ receipt: { txHash, status, blockNumber } \| null }` |

A revert comes back as raw data, which the agent decodes against the Meigi ABIs. A chain failure is a generic `502`.

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
