# AI usage

ETHGlobal asks teams to disclose how AI was used. We used it heavily and deliberately.

## Tools

- **Claude Code** (Anthropic, Claude Opus 5.5) as the main pair programmer and orchestrator. It ran several
  parallel sub-agents: landing page, ENS scripts, security review, benchmark and fine-tuning, AP agent service.
- Commits written with AI assistance carry a `Co-Authored-By: Claude` trailer.

## What AI did

- Research: event rules, sponsor docs (ENS v2, World ID 4.0, Intercepta, JPYC), NTA data formats.
- Code: Solidity contracts and tests, the verifier and agent services, scripts, the landing page.
- AI security review in three rounds, each by a separate read-only agent with proof-of-concept exploits.
  Of 16 findings, 14 are fixed. Two are accepted by design and documented: the fixed 30-day cap window, and
  trusting the attester to verify World ID off-chain. See the two `fix(contracts): address … review findings`
  commits. Round 3 verified the fixes with mutation testing.
- Benchmark data generation (PayeeBench-JA) and the fine-tuning pipeline.

## What we decided

Product direction, the threat model, sponsor choices, demo design, and every trust assumption documented in
`contracts/README.md`. We reviewed AI-generated changes before committing; tests gate every commit.

## Spec files

- `docs/spec.md`: product and architecture
- `docs/landing-spec.md`: landing page brief
- `contracts/README.md`: contract roles, delays and trust model

## Third-party code

Public libraries only, disclosed in each package's manifest: OpenZeppelin Contracts, forge-std, viem, Hono,
zod, World IDKit, three.js / react-three-fiber, and the Kev training code (Apache-2.0) used for fine-tuning.
No pre-hackathon project code or designs.
