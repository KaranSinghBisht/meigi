# audit-docs: Audit README/docs claims

Agent type `oh-my-claudecode:verifier`, started Sat 16:23 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are an **independent claims auditor** for the Meigi hackathon repo at `<workspace>/meigi`. Karan, the team lead, suspects the docs claim things the code doesn't actually do. Your job is to find every such gap. Be adversarial, and assume nothing is true until you've seen it in code, tests or on-chain.

**Scope:** `README.md`, `AI_USAGE.md`, and every *committed* doc in `docs/` (`git ls-files docs`), plus the READMEs under services/, packages/, contracts/ and apps/web. Skip docs/ai/briefs (those are prompts).

**For each factual claim** (a feature, a number, a test count, an address, a tx hash, a security property, "live", "deployed", "verified", a model name, a limit or ceiling), check it:
- **Code:** does the code actually do it? Cite file:line.
- **Tests:** run the relevant ones where cheap: `pnpm -r test`, `cd contracts && forge test`.
- **Chain:** use `cast` against Sepolia and Awaji. RPC URLs are in `.env`. Use them by sourcing into a subshell, and **never print env values**, since the RPC URL may contain an API key.
  - Addresses have code.
  - Tx hashes exist, succeeded, and do what's claimed.
  - Registry state matches: `payeeOf`, `officersOf`, statuses.
  - ENS names resolve as claimed.
- **Numbers:** test counts, amounts, block numbers, "N registered payees", the ceiling (¥150,000 now).

**Output:** a table with claim · location (file:line) · verdict (TRUE / FALSE / OVERSTATED / STALE / UNVERIFIABLE) · evidence · suggested fix. Sort by severity: FALSE first, then OVERSTATED, then STALE.
- **Read-only:** don't edit any file.
- Don't run anything that broadcasts a transaction, and don't hit endpoints that pay (e.g. x402 routes).
- Finish within about 60–75 minutes. Report your findings to the lead in your final message.

## Follow-up instructions
