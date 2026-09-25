# Meigi (名義)

**Confirmation of Payee for stablecoins and AI agents. Pay companies, not addresses.**

Every Japanese business has a public T-number. Meigi binds it to one payout address:
- registered after an NTA exact-match, a domain proof and World ID;
- changed only by the company's same verified humans, after a 72h public timelock;
- enforced on-chain at payment time.

`t2011001234567.payee.eth` resolves in any ENS client. An AI agent paying from an `AgentVault` can be
prompt-injected into *wanting* to pay a scammer, and the chain still refuses.

ETHGlobal Tokyo 2026 · From Scratch · Karan Singh Bisht & Adithya Prasanna Suriya Prakash

## Repo

| Path | What |
|---|---|
| `contracts/` | Foundry: `PayeeRegistry`, `PayeeResolver` (ENSIP-10), `AgentVault`, `PayRouter`, `MockJPYC`. 86 tests. |
| `services/verifier/` | Attester API: NTA exact match, DNS proof, World ID 4.0 officer sessions, EIP-712 approvals. |
| `services/agent/` | AP agent: extraction → System-1 triage → deterministic kernel → screening → pay or hold. |
| `packages/abi/` | Typed ABIs generated from the contracts. |
| `apps/landing/` | Landing page ("Sakasa Fuji"). |
| `bench/` | PayeeBench-JA and a fine-tuned System-1 model. |
| `docs/` | Spec files. |

## Quick start

```sh
cd contracts && forge test                    # contracts
pnpm install && pnpm --filter @meigi/verifier test
python3 services/verifier/scripts/build_nta_index.py data/nta/raw/*.csv   # after downloading NTA bulk data
```

Configuration lives in a git-ignored `.env`; see each package's README for its variables.

See [`docs/spec.md`](docs/spec.md) for the design and [`AI_USAGE.md`](AI_USAGE.md) for how AI was used.
