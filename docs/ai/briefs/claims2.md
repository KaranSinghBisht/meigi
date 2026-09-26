# claims2: Re-audit all public claims after tonight's changes

Agent type `oh-my-claudecode:verifier`, started Sat 20:36 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

Read-only claims audit for Meigi (名義), ETHGlobal Tokyo 2026. Submission is due Sun 27 Sep 09:00 JST. Many things changed tonight (19:00–20:35 JST), and the judges will read these surfaces:
- The ENS **CompanyNamespace** went live (0x7ECaD5Fd6892270F09D91aB296786186C5bC660A) with 4 issued names.
- A **MandateGate** (0x591dd2b2716b46740C665749A60209B7b22e83BF) became the AgentVault's agent at 20:15 JST, and a live pay → revoke → refused → re-issue → pay run was recorded in `docs/ens.md`.
- A 6th fixture payee was registered (ハルカ製作所, T4999900000005).
- The site gained a live refusal button and an issued-names block.
- Docs were reworded.

Independently verify that every factual claim on the surfaces below is true right now. Use the chain, the code and the live site. Don't trust other docs as proof.

## Surfaces
1. `<workspace>/meigi/docs/submission.md`. It's private and untracked, but it's what gets pasted into the form, so it matters most.
2. `<workspace>/meigi/README.md`
3. `<workspace>/meigi/docs/ens.md`, especially the live evidence tables.
4. `<workspace>/meigi/AI_USAGE.md`
5. The live site https://meigi.karanbishttt.workers.dev. Fetch the pages, and for the SPA text, fetch the hashed JS chunks.
6. `<workspace>/knowledge/Meigi-briefing.md`. It's Karan's talking points (private); flag anything false in it too.

## Checks
- **Every tx hash and address:** exists on Sepolia (or Mizuhiki Awaji 6497 where stated), status 1, and does what the text says.
  - Sepolia RPC: https://ethereum-sepolia-rpc.publicnode.com, or https://sepolia.gateway.tenderly.co if throttled.
  - Awaji RPC: https://rpc.awaji.mizuhiki.io
  - Use `cast`.
- **Every number:** test counts, payee counts, the Sourcify claims, word counts where the form has limits (tagline ≤ 100 chars, description ≥ 280 chars), the neuron caps, and the prices.
- **Every "live" claim:**
  - is the mandate really the vault's agent now (vault 0x87A798CD92dE1340B1b761dd45196AC82bEF793B, `agent()`);
  - do the issued names answer (CompanyNamespace `answers(uint64,string)`);
  - does `t2011001234567.payee.eth` resolve with stock viem's default Sepolia resolver?
- **Every `#L` line citation** in submission.md: run `bash <scratchpad>/check-citations.sh`, and check each points at the claimed symbol.
- **Test counts:** docs may say 138. Report the true count by running `forge test` in a temporary worktree of HEAD (`git worktree add`), never in the main tree, which is frozen. Remove the worktree afterwards.
- **Consistency across surfaces:** the same fact stated differently, e.g. "4 active" vs "5 active payees · 1 disputed".
- **Overclaims against the house wording rules:**
  - "registered payee", never "verified company";
  - a "JPYC stand-in" (mJPYC), never "JPYC";
  - no "booth" or "today";
  - "the vault's agent key" is stale now that the gate is the agent;
  - governance is one key held by the team;
  - the attester is our server.
- **Anything claiming a World ID phone run or officer registration is complete.** It isn't yet: T7999900000002 is unregistered, and the run happens on camera later. Such claims must be marked pending, or be absent.

## Rules
- Read-only: don't edit any file, don't commit, and don't touch local services except with GETs.
- Never print `.env` values.
- Use absolute paths, and don't `cd` into the main repo.

## Report
- A table: surface · claim (quoted, ≤ 20 words) · verdict (TRUE / FALSE / STALE / OVERCLAIM / UNVERIFIABLE) · evidence (tx, block or file:line) · exact fix wording.
- Put FALSE and OVERCLAIM first.
- Then a short list of the fixes by file, so the lead can dispatch them.

## Follow-up instructions
