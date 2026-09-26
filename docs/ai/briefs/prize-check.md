# prize-check: Prize-requirements readiness check

Agent type `oh-my-claudecode:verifier`, started Sat 17:05 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You're an **independent prize-readiness auditor** for team Meigi at ETHGlobal Tokyo 2026. Submission closes Sun Sep 27 09:00 JST. Partner picks (max 3): **World** (both From-Scratch tracks: Best Use of IDKit, and Best Use of World ID for Agents), **ENS** (Best Use of ENSv2), and **Curvegrid** (Best AI Agent Project). Be adversarial and assume nothing.

**Sources of truth for the requirements:**
- `<workspace>/research/HACKATHON_CONTEXT.md`, which has the prize text and ETHGlobal's general rules (git history, AI-usage attribution, all specs, prompts and planning artifacts committed, video 2–4 min, etc.);
- the Curvegrid README requirements: a one-sentence summary; how MultiBaas was used (optional); a team intro with social handles; setup and testing instructions; MultiBaas feedback;
- World's requirements: the minimum sufficient credential plus a rationale, server-side or on-chain verification, a success path plus one alternative path (cancel, unavailable credential, rejection or ineligible user), and an integration debrief; for Agents, the official sandbox dev env, the full journey, a denied/expired/cancelled path where the action doesn't happen, backend validation, and a debrief;
- ENS: ENSv2 Beta on Sepolia, central not cosmetic, functional with no hard-coded values, a live demo link plus an open-source repo, and the features they name (wildcard, own subname registry, EAC, PermissionedResolver per subname, aliasing, expiring/revocable/non-transferable, agents as namespaces via ENSIP-25/26).

**Evidence to check:**
- The repo `<workspace>/meigi`: README.md, docs/ (world-debrief.md, world-agents-deny-run.md, world-live-run.md, ens.md, mizuhiki.md, trust-and-compliance.md), AI_USAGE.md, docs/ai/, contracts/, services/, apps/web.
- The **local** submission kit `meigi/docs/submission.md`. It's git-ignored on purpose; read it, never add it.
- The live site https://meigi.karanbishttt.workers.dev, via curl.
- The chain: use `cast`, with RPC URLs from meigi/.env sourced in a subshell. **Never print env values.**

**Output:** for each prize, a requirement-by-requirement table with requirement · met? (YES / PARTIAL / NO / PENDING) · evidence (file:line, URL or tx) · the gap and the smallest fix. Then do the same for ETHGlobal's general rules: repo hygiene, AI disclosure, planning artifacts committed (docs/ai/briefs; note they may be stale until the freeze re-export), README completeness, and the video. End with a ranked "must fix before submission" list and a "nice to have" list.

Known pending items; confirm their status, don't re-report them as surprises:
- the real World ID phone run (T7999900000002, not yet registered);
- the demo video;
- Adithya's GitHub handle in the README;
- the repo going public at the flip;
- CompanyNamespace (ENS), being fixed after review and not live.

Read-only: no edits, no broadcasts, no paying endpoints. Finish within about 60 minutes and report in your final message.

## Follow-up instructions
