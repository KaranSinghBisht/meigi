# AI usage

ETHGlobal asks teams to disclose how AI was used. We used it heavily and deliberately. This file lists each
area.

## Tools

- **Claude Code** (Anthropic, Claude Opus 5.5) was the main pair programmer and orchestrator. One lead
  session wrote the core and ran parallel sub-agents for the landing page, ENS scripts, security reviews, the
  benchmark and fine-tuning, the AP agent service and the web app.
- Every brief and every later instruction the lead session gave to the agents that built, reviewed or documented the
  project is committed verbatim in [`docs/ai/briefs`](docs/ai/briefs). Real people's names are redacted, marked
  `[redacted: name]`. Eight agents that only prepared private notes for the team (a briefing, a judge critique,
  judge and speaker research, live event notes, talk transcripts, a Q&A sheet, a pitch document, and drafts of this
  disclosure) are listed there by name, but their briefs aren't published. The specs are in `docs/`.
- AI-assisted commits carry a `Co-Authored-By: Claude` trailer, except 32 made between 13:50 and 16:14 JST on
  Sep 26.
- **OpenAI Codex** made one revision to the landing's garden (`packages/scene` planting and materials), run by
  Karan. The `landing` sub-agent reviewed it, fixed three regressions and committed it.

## Who wrote what

The code and docs were written by AI. The people provided direction, choices, accounts and testing (next
section).

| Area | Written by |
|---|---|
| `contracts/` (registry, resolver, vault, router, mock JPYC, tests, deploy scripts) | AI (lead session) |
| `contracts/script/ens/` | AI (`ens` sub-agent) |
| `contracts/src/ens/CompanyNamespace.sol`, `contracts/src/payments/MandateGate.sol` | AI (`ens` sub-agent) |
| `services/verifier/`, `packages/x402-guard/`, `services/x402-demo/`, `workers/ai-proxy/`, `scripts/` | AI (lead session) |
| `services/agent/` | AI (`apagent` sub-agent) |
| `services/signer/` | AI (`apagent` sub-agent) |
| `apps/web/` | AI (`webapp` sub-agent) |
| `apps/landing/` | AI (`landing` sub-agent), from our art direction: a Tokyo / Mt Fuji take inspired by, not copied from, an existing landing page |
| `bench/` (PayeeBench-JA, fine-tuning runs) | AI (`bench` sub-agent) |
| Docs (`README.md`, `docs/`) | AI |

## What the people did

- **Chose** the idea from AI-researched options, and chose the sponsor prizes and the team.
- **Set** the direction and constraints: full scope, the landing page's look, conventional commits as we go,
  and security and coding rules for all code.
- **Handled** accounts, keys and funds: the World Developer Portal, Cloudflare, Sepolia ETH and the Intercepta
  key request.
- **Tested** the demos; Karan records the demo video.

## Reviews

Every review was done by a separate AI reviewer, not by the author agent.

- **Contracts:** three read-only rounds with proof-of-concept exploits. Of 16 findings, 14 are fixed. Two are
  accepted by design and documented: the fixed 30-day cap window, and trusting the attester to verify World
  ID off-chain. Round 3 mutation-tested the fixes.
- **Contracts added later:** `CompanyNamespace` passed a review after two rounds (48 of 48 in the reviewer's fork
  harness, no open findings), and `MandateGate` passed one (30 of 30 on a fork, in front of the live vault and against
  the live names). The harness isn't in the repo; the 8 fork tests in
  [`CompanyNamespaceFork.t.sol`](contracts/test/ens/CompanyNamespaceFork.t.sol) and
  [`MandateGateFork.t.sol`](contracts/test/payments/MandateGateFork.t.sol) are. See [`docs/ens.md`](docs/ens.md).
- **AP agent:** three review rounds and a final pass. Every bypass found is now a regression test: hidden
  content, markup, refund notices, ambiguous totals and bidi controls.

## Third-party code

Public libraries only, disclosed in each package's manifest:
- OpenZeppelin Contracts, forge-std
- viem, Hono, zod
- World IDKit, the x402 packages
- three.js / react-three-fiber, React
- the Kev training code (Apache-2.0, used from its own repository for fine-tuning)

There is no pre-hackathon project code or design. Ideation research before the event used AI but produced no
code.
