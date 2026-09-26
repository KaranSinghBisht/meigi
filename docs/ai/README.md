# AI planning artifacts

ETHGlobal asks that specs, prompts and planning artifacts be committed. This folder holds them. The product
specs themselves live in `docs/` (`spec.md`, `landing-spec.md`, `world-agents-spec.md`). See `AI_USAGE.md`
for how AI was used overall.

`calls-we-made.md` lists the decisions Karan made, in his own words, and `prompts.md` has the messages behind them.

`briefs/` contains the prompt the lead Claude Code session gave each parallel sub-agent, followed by every
later instruction sent to it:

| Agent | Built or checked |
|---|---|
| [`apagent`](briefs/apagent.md) | `services/agent`, the AP agent service |
| [`bench`](briefs/bench.md) | `bench/`: PayeeBench-JA and the fine-tuned System-1 model |
| [`contracts-review`](briefs/contracts-review.md) | security review of `contracts/` (read-only) |
| [`demo`](briefs/demo.md) | `apps/web/src/features/demo`: the animated, recorded demo player |
| [`ens`](briefs/ens.md) | `contracts/script/ens`: `payee.eth` on ENSv2 Sepolia |
| [`fix-verify`](briefs/fix-verify.md) | re-verification of the contract fixes against the review's PoCs (read-only) |
| [`onboard`](briefs/onboard.md) | `apps/web`: the company onboarding wizard |
| [`webapp`](briefs/webapp.md) | `apps/web`, the main app |
| [`worldui`](briefs/worldui.md) | `apps/web`: World ID officer demo logic (fixtures, credential switch) |
| [`audit-core`](briefs/audit-core.md) | independent security/claims audit of contracts and core agent behavior (read-only) |
| [`audit-docs`](briefs/audit-docs.md) | independent audit of docs/README claims vs. actual code (read-only) |
| [`audit-site`](briefs/audit-site.md) | independent audit of the live site's claims vs. actual behavior (read-only) |
| [`benchaudit`](briefs/benchaudit.md) | independent audit of PayeeBench-JA and the fine-tune, for the paper (read-only) |
| [`benchresearch`](briefs/benchresearch.md) | research on public benchmarks/open models for the PayeeBench-JA paper |
| [`claims2`](briefs/claims2.md) | read-only re-audit of public claims after late changes, before submission |
| [`demo-check`](briefs/demo-check.md) | independent verification that the live finalist demo path actually works |
| [`docfix`](briefs/docfix.md) | fixes to public docs, README and site copy from review feedback |
| [`dryrun`](briefs/dryrun.md) | headless-browser dry run of every demo video take, before recording |
| [`fr-fable`](briefs/fr-fable.md) | zero-shot baseline classifier for the PayeeBench-JA benchmark (Fable) |
| [`fr-haiku`](briefs/fr-haiku.md) | zero-shot baseline classifier for the PayeeBench-JA benchmark (Haiku) |
| [`fr-haiku-a`](briefs/fr-haiku-a.md) | zero-shot baseline classifier for the PayeeBench-JA benchmark (Haiku, rerun a) |
| [`fr-haiku-b`](briefs/fr-haiku-b.md) | zero-shot baseline classifier for the PayeeBench-JA benchmark (Haiku, rerun b) |
| [`fr-haiku-c`](briefs/fr-haiku-c.md) | zero-shot baseline classifier for the PayeeBench-JA benchmark (Haiku, rerun c) |
| [`fr-opus`](briefs/fr-opus.md) | zero-shot baseline classifier for the PayeeBench-JA benchmark (Opus) |
| [`fr-sonnet`](briefs/fr-sonnet.md) | zero-shot baseline classifier for the PayeeBench-JA benchmark (Sonnet) |
| [`latereview`](briefs/latereview.md) | read-only security/regression review of late payment and registration changes |
| [`prize-check`](briefs/prize-check.md) | independent audit of readiness for the World/ENS/Curvegrid prize requirements |
| [`repro-engineer`](briefs/repro-engineer.md) | fresh-clone reproducibility check: does the README alone get a judge running it? |

## Not published here

These sub-agents' output is the team's own private preparation, not project work, so their briefs are not published in `docs/ai/briefs/`:

- **`people`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`pitchdoc`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`scout`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`videos`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`briefs`** -- this export's own tooling
- **`briefing`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`judge-critic`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`whiteboard`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`ensresearch`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`judge-world`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`judge-ens`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`judge-curvegrid`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`explainer`** -- private team preparation (pitch, presentation and Q&A), not project work
- **`landing`** -- retired landing page; brief was mostly visual references
- **`compliance`** -- private team preparation (pitch, presentation and Q&A), not project work

## Redactions in the published briefs

Names of real people other than Karan and Adithya (judges, sponsor staff, workshop speakers) are redacted and marked `[redacted: name]`. Sentences or paragraphs whose content was the team's own private preparation -- rather than project work -- are redacted and marked `[redacted: private preparation]`, with any surrounding technical instruction kept. Everything else -- including fictional demo fixtures like "Haruka" and real technical terms like the "Garfield" testnet -- is reproduced verbatim.

The contracts, verifier, x402 guard, x402 demo, AI proxy and deploy scripts were written in the lead session
itself, from `docs/spec.md`.
