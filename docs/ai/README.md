# AI planning artifacts

ETHGlobal asks that specs, prompts and planning artifacts be committed. This folder holds them. The product
specs themselves live in `docs/` (`spec.md`, `landing-spec.md`, `world-agents-spec.md`). See `AI_USAGE.md`
for how AI was used overall.

`briefs/` contains the prompt the lead Claude Code session gave each parallel sub-agent, followed by every
later instruction sent to it:

| Agent | Built or checked |
|---|---|
| [`landing`](briefs/landing.md) | `apps/landing`, the Sakasa Fuji landing page |
| [`contracts-review`](briefs/contracts-review.md) | security review of `contracts/` (read-only) |
| [`fix-verify`](briefs/fix-verify.md) | re-verification of the contract fixes against the review's PoCs (read-only) |
| [`ens`](briefs/ens.md) | `contracts/script/ens`: `payee.eth` on ENSv2 Sepolia |
| [`bench`](briefs/bench.md) | `bench/`: PayeeBench-JA and the fine-tuned System-1 model |
| [`apagent`](briefs/apagent.md) | `services/agent`, the AP agent service |
| [`webapp`](briefs/webapp.md) | `apps/web`, the main app |

The contracts, verifier, x402 guard, x402 demo, AI proxy and deploy scripts were written in the lead session
itself, from `docs/spec.md`.
