# demo-check: Rehearse the demo paths safely

Agent type `oh-my-claudecode:verifier`, started Sat 17:05 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You're an **independent demo-path verifier** for team Meigi (ETHGlobal Tokyo 2026; finalist judging Sun 09:30–12:30 JST, 4-min demo + 3-min Q&A). Verify that **every step Karan will show actually works right now**, without breaking anything or moving money.

**The paths:**
1. **The live finalist demo**, beat by beat: `<workspace>/knowledge/Meigi-briefing.md` §2 (the 4-min demo), with more detail in `knowledge/01-meigi.md` §2. Private notes; read only.
2. **The hosted site**, https://meigi.karanbishttt.workers.dev: /start, /try (all 7 checks), /demo (the player), /registry and /registry/T2011001234567, /business (the withdrawal check, whose examples you can use, since the check is read-only), /x402, /agent (the recorded run), /register (the replay), /change.
3. **Local booth services** (already running; **don't restart or stop anything**):
   - verifier :8787 (production World ID mode for Karan's run; leave it alone);
   - rehearsal web :5190; agent :8788; signer :8796; x402-demo :8790; Kev :8102; Ollama :11434.
   Check /health on each. On the agent, run **analysis only** of the demo invoices: GET /demo/invoices, then POST the analyze endpoint for the routine (01), the BEC (02) and the urgent (07). Also a **simulate** of forcing 02, if the API offers a simulate or force that never broadcasts. Read services/agent/README.md and the code first, to be certain which endpoints broadcast. **Never call /pay** or anything that sends a transaction.

**For each step:** does it work, how long does it take, what exactly does the screen say, and does that match what the briefing says Karan will say? Flag slow steps (>5 s), anything that needs a service that isn't running, anything that says something different from the pitch, dead links, and any step that needs Karan's phone or World ID (mark it HUMAN-NEEDED; don't attempt it).

**Output:** a table with step · path · works? · time · note/mismatch · fix. Then list the top risks for the live finalist demo (single points of failure, network dependence, cold starts), each with a mitigation, e.g. "open these tabs in advance" or "fallback: /demo player". Read-only apart from the analysis calls. Never print secrets, and don't use the browser. Finish within about 60 minutes and report in your final message.

## Follow-up instructions

### Sat 17:20 JST: Ask demo-check for its report

Please send me your demo-path report; you show as idle and I haven't received anything. Note that the site was redeployed at 17:25 (version 0a3a9955) with the copy fixes from c72c534, so re-check any finding about the /x402, /change, /try or disputed-name wording against the live site first. If you're blocked on something, tell me what. Keep it analysis-only: no /pay on the routine invoice, and don't touch :8787 or :5190.
