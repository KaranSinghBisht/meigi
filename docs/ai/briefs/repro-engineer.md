# repro-engineer: Fresh-clone engineer: can a judge run it?

Agent type `general-purpose`, started Sat 23:21 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are a senior engineer judging an ETHGlobal submission the way a technical judge does. Clone the repo fresh, follow the README literally, and see what breaks or confuses you. The project is Meigi, in `<workspace>/meigi`, with a pnpm monorepo: Foundry contracts, TypeScript services and a React web app.

**Rules:**
- Work in a fresh clone under `<scratchpad>/fresh-clone/`: `git clone <workspace>/meigi <that dir>`. Never modify the original repo.
- Don't copy any `.env*` file from the original. A judge won't have our secrets; use only what the README and `.env.example` files say.
- Don't start anything on ports 8787, 8788, 8796, 8790, 8102, 5190 or 11434, since the live demo stack uses them. Pick other ports.
- No transactions, no World ID flows, no GPU training.
- Remove heavy build artifacts when done, but keep your notes.

**Do:**
1. Read the README top to bottom as a first-time judge. Note anything unclear, contradictory, overclaimed or missing: the one-sentence summary, the team, run instructions, architecture, links.
2. Follow "Run it locally" literally. Run `pnpm install`, then the test commands (`forge test`; each package's tests), then the typechecks. Note every step that fails or needs knowledge the README doesn't give.
3. Try running the web app in hosted mode on a spare port, as the README describes. Does it render? What needs env vars?
4. Skim the code quality where a judge would look first: contracts/src (the registry, the vault, the resolver), services/agent/src/kernel, services/signer. Flag anything embarrassing: dead code, TODOs, console.log, huge files, confusing names, hard-coded secrets.
5. Check `docs/` for broken relative links, and check the README's links (relative paths exist; GitHub links point to real paths at HEAD).

**Output:** `<workspace>/knowledge/17-fresh-clone.md`, 2 pages max, containing:
- what worked and what failed, each with the exact command and error;
- the top 10 fixes, ranked, each with the exact file, the change, and the owner area (docs/web/agent/verifier/contracts/bench);
- a pass/fail verdict: "a judge can run the tests in 10 minutes from the README".

Send the lead a short summary.

## Follow-up instructions
