# docfix: Apply judge-review phrase fixes to docs

Agent type `general-purpose`, started Sat 17:27 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are the docs fixer for Meigi (名義), an ETHGlobal Tokyo 2026 project (Confirmation of Payee for stablecoins and AI agents). The repo is `<workspace>/meigi` (git). Private notes live outside it in `<workspace>/knowledge/`. Submission closes Sun 27 Sep 09:00 JST, and first-round judging is 4 min demo + 3 min Q&A.[redacted: private preparation] Read all of it first. Your job is to apply its wording fixes (§2, §3, §4, §6B, §6C, §7 fixes 5, 8, 9) to the docs below, accurately. You must not invent facts.

## Files you may edit
- `meigi/README.md` and `meigi/docs/spec.md`: tracked. Commit these, by path.
- `meigi/docs/demo-script.md` and `meigi/docs/submission.md`: PRIVATE and untracked. Edit them, but NEVER `git add` them, and never `docs/sponsors.md` either.
- `knowledge/Meigi-briefing.md` (Karan's 19-page briefing) and `knowledge/07-video-kit.md`: private, outside git.

Do NOT touch `apps/`, `services/`, `contracts/`, `packages/`, `workers/`, `docs/ens.md` or `docs/world-*.md`. Other agents own those and are editing them right now.

## Fixes
1. **"holds JPYC … only pays verified companies"** (README ~line 56, and the same phrase in spec.md and demo-script.md) → "holds a JPYC stand-in and only pays registered payees". Use "registered payee", never "verified company", anywhere you touch.
2. **"Five million companies matched by exact name"** and similar → say it was checked against the tax agency's records. The exact figure is in `docs/runbook.md`: 5,787,472 corporate-number records, closed ones included. So "the tax agency's 5.8 million company records", not "five million open companies".
3. **The one-liner** "the money can only reach that company's registered wallet" → "and your wallet, exchange or agent refuses any other address". A plain wallet send isn't checked, only the vault, router, guard and withdrawal check.
4. **The 30-second pitch:** "Changing that wallet takes the company's verified humans and 72 hours in public" → "Nothing can change that wallet in under 72 hours, and every change is public". It must not omit the governance dispute path.
5. **"It was a simulation; nothing was broadcast"**: remove it from the 4-minute beat. In Q&A only: "a call against the live contract, the same code path as a transaction".
6. **"a verified human decides"** → "a human approves through World's sandbox", said once.
7. **"a 0.8B model that beats a 70B LLM"**: drop it from the 4 minutes. In Q&A add "on held-out templates of our own benchmark".
8. **"The registry is a public good"** → "designed as a public good: anyone reads it; today one key owns it, and production moves it to a timelocked multisig".
9. **"every settlement indexed by MultiBaas"** → "every settlement since we linked it". Find the real start block in the repo (README's MultiBaas section, or `docs/`). Quote it only if you find it; don't take the critic's number on trust.
10. **Model time:** "55 ms" (video) vs "39 ms" (briefing). Spoken lines say "in milliseconds". Where a table keeps numbers, label which is one run and which is p50, sourced from `bench/README.md`.
11. **Sourcify:** "all five" vs "4 of 4 core". Check with the Sourcify API (`https://sourcify.dev/server/v2/contract/11155111/<address>` or the files endpoint) for the five Sepolia addresses in `docs/runbook.md`, then state exactly what's verified, consistently.
12. **JAL:** `knowledge/02-japan-primer.md` says about ¥380M lost across TWO cases (2017). Any "one email/one invoice cost JAL ¥380M" → "Emails like this cost Japan Airlines about ¥380 million in 2017".
13. **The briefing's `cast` fallback** prints raw hex. Replace it with the critic's §7 fix 8 one-liner, AFTER running it yourself against the live Sepolia vault. Use RPC `https://ethereum-sepolia-rpc.publicnode.com`, vault `0x87A798CD92dE1340B1b761dd45196AC82bEF793B`, the bank-change args, `--from` the vault's current `agent()`, and a fresh random invoiceRef. Read `contracts/src` for the payInvoice signature. It's read-only; never send a tx. Put the exact tested command in the briefing, with the output you got.
14. **The briefing's demo section:** replace the old beat list with the critic's §2 beat list, with fix 12 applied. Add its "Cut from the 4 minutes" list, "If you run long", and the Q&A move. Add a note that the order changed after the judge review and why (the wow within the first 60 s; the withdrawal check as the practicality beat). Mirror the same order in `docs/demo-script.md`.
15. **The briefing's Q&A:** fold in §4's five answers and the three one-liners.
    - Q1's e-certificate clause must be framed as a direction, not something we have, as the critic says.
    - Mark Q5 "use only after our prompts are committed (pending Karan)".
    - Check every factual clause against `knowledge/02-japan-primer.md`, `docs/trust-and-compliance.md` and the README before keeping it. Drop any clause you can't source.
16. **§3's rival sentence:** add the spoken version to the briefing, and the written version to submission.md and the README's pitch section if one fits naturally.
17. **Video kit (`knowledge/07-video-kit.md`):**
    - start the recording at chip 1 (the email), not chip 0;
    - add a ~25 s live withdrawal-check segment on `/business` (bank-change scam address → hold; Meigi Shoji's payout → release), warmed up first (5.4 s cold, ~2 s warm);
    - add a ~10 s World ID for Agents Deny take ("Deny → Nothing paid"), since the prize text asks for a denied path;
    - target ≈ 2:50 total. Keep the kit's existing rules: Karan's own narration, no AI voice, no speed-up.
18. **submission.md's Curvegrid block** cites `services/signer/src/app.ts#L84` as the /pay route. grep the current line of the `/pay` handler and fix it. Add an HTML comment `<!-- re-verify all #L line citations at the freeze -->` at the top of the file.
19. **Leave "Adithya: TODO" as is.** It's pending Karan.

## Rules
- Product voice, not hackathon copy. No new claims. Every number must trace to the repo, docs, chain or knowledge files.
- Where the critic and the sources disagree, the sources win. List every such case in your report.
- Keep the briefing about the same length. It's for a two-hour read, so replace text rather than append.
- For repo commits, use Conventional Commits and commit by path (`git commit -- README.md docs/spec.md`). Check `git diff --cached` first, because other agents commit concurrently. End the message with:
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HAsqcAGquPFh83q8WqHVcu
- Never print secrets. Git-ignored env files (.env, .env.signer, .env.names, .env.awaji) are off-limits.
- Use absolute paths or `git -C`; don't `cd` into the repo in a way that changes the shared cwd.

When done, report: the commit hash(es), a list of every change grouped by file, the cast command output, the Sourcify result, and any critic claim you dropped as unsourced.

## Follow-up instructions

### Sat 17:28 JST: Two drifted citations; use the checker script

Two line citations in submission.md have drifted. Fix both while you're in the file.
- `services/signer/src/app.ts#L84` points at /simulate. The /pay handler is at **#L92** at HEAD 73a2cca, not L90.
- `services/verifier/test/app.test.ts#L146` ("A different human is denied") points at a closing `});`. That test (`it("denies a different human"`) is at **#L164**.

To check every citation, run `bash <scratchpad>/check-citations.sh`. It prints the line each `blob/main/…#L` link points at in HEAD; run it once more after your edits. At the freeze I'll pin every link to the final commit, so it won't drift again.

### Sat 17:34 JST: Briefing line 107: invoice 07 renumber note

One more for the briefing, around line 107, which currently says "Invoice 07 … is now MS-2026-0931". A live payment spends an invoice number, and apagent added `pnpm --filter @meigi/agent demo:renumber` (444f309), which moves a spent number to the next free one. The console picks it up without a restart. After tonight's rehearsal, 07 becomes MS-2026-0932. Each live run spends both 01 and 07, so between two live runs (judging, then the finalist stage) run demo:renumber once. Say that in the briefing without pinning a number that goes stale, e.g. "07's number changes after every live payment; run demo:renumber between runs". I'm adding the same line to the runbook myself, so don't touch docs/runbook.md.

### Sat 17:40 JST: ENS names now live: facts for briefing/submission

New facts for the briefing's ENS section and the submission's ENS block. Keep it short, and source everything from docs/ens.md at 491e8b1.

**Company-issued names are live on the Sepolia ENS Beta**
- ap / keiri / zeirishi.t2011001234567.payee.eth, with ENSIP-27 classes Agent / Workgroup / Person.
- The ap agent is ERC-8004 agent 10526, linked by ENSIP-25, and sets its own agent-status.
- The buyer ハルカ製作所 (T4999900000005) issued ap.t4999900000005.payee.eth to the vault's agent key.
- The names are text-only (no address, so they can never be paid). They answer only while the company is active and under the key that issued them.

**The mandate (MandateGate) isn't wired yet.** Word it as "built, reviewed, and wired to the live vault after the video". If the wiring happens later tonight, I'll tell you to switch it to live.

**Commits:** the index is shared, so commit only with `git commit -m "…" -- <paths>`. Don't leave files staged, and never run a bare `git commit`. ens committed docs/spec.md in 491e8b1, so re-read it before you edit it.

### Sat 19:22 JST: Network is back: resume and report

The network dropped from about 18:01 to 19:20 JST and your turn failed. I can see ff41f16 and 49561ef landed. Please resume: check the briefing PDF from 17:48, finish any fixes still open from my list (including the ENS-live facts and the 07 renumber note), and then send me your full report.

### Sat 19:33 JST: 3 more code-vs-doc fixes + stop-the-signer note

The whiteboard agent checked 168 claims against the code. Please fold in these fixes; the code wins every time.
1. **README.md:93** says "the LLM only explains". But the LLM also proposes, and can pick the destination (services/agent/src/kernel/intent.ts:11, 39–49). Match README.md:148's wording: the model proposes, and the kernel and the vault decide.
2. **contracts/README.md:10** says a disputed payee publishes "only its status". It also publishes `meigi.tNumber` and `meigi.registry` (PayeeResolver.sol:99–101). Say it publishes its status and those two pointers, never a name or payout. I'm fixing the same line in the runbook myself.
3. **The briefing and 08's Curvegrid beat**, "stop the signer and the agent can't pay": under `scripts/ap-stack.sh`, killing only the signer process restarts it within 2 s (ap-stack.sh:44–53). Don't script "kill the signer". I've asked apagent for the reliable way to show it; until they answer, write "stop the stack with `scripts/ap-stack.sh --stop`, or have the vault owner call `pause()`".
4. **Don't mix up the two vault errors**, anywhere you mention them. `PayeeMismatch` means the invoice's address isn't the registry's payout (PayeeGuard.sol:26). `VendorPayoutChanged` means the vault's pinned payout no longer matches the registry (AgentVault.sol:96).

Commit by path, then send me the full report when you're done.

### Sat 20:25 JST: Mandate is LIVE: switch briefing item 6 + submission ENS sentence

The ENS mandate is live, so switch the briefing's item 6 and the submission's ENS sentence to "live" and drop the PENDING marker. Source it from docs/ens.md at cbb69e4.
- **Gate:** MandateGate 0x591dd2b2716b46740C665749A60209B7b22e83BF has been the AgentVault's agent since 20:15 JST (wire tx 0x7c61fe3b…31fe). The agent pays only while ap.t4999900000005.payee.eth answers and it holds that name.
- **Live evidence:**
  - A: pay 0xd1ccd8b7…adb90;
  - B: revoke 0x5d0b277c…645e;
  - the next payment was refused with MandateNotLive in simulation, and nothing was sent (audit #50, #51);
  - C: re-issue 0xfcf386a0…4216;
  - D: pay 0xb49d32fe…e6a77.
- **The one-liner for judges:** "Revoke the agent's ENS name and the vault stops paying it, on-chain."

Keep it short. Then rebuild the briefing PDF.

Also, for the briefing's Curvegrid Q&A line: the reliable stop-the-signer demo is now `scripts/ap-stack.sh --pause-signer`. Pay then returns "The signer isn't answering, and the agent holds no key of its own: nothing was signed or sent." Then `--resume-signer`. The details are in runbook demo check 10 (8f81b93). Replace the pause()/--stop wording with that.

### Sat 20:30 JST: Great catch on NotAgent; yes add the Curvegrid mandate line

Great catch on the NotAgent fallback. Reading agent() inline was the right fix.

Yes, add the one Curvegrid line: the mandate as a live policy example ("revoke the agent's ENS name and the vault stops paying it, on-chain"). Put it in the submission's Curvegrid block and in the briefing's section for [redacted: name], since it's his "policy engine plus secure signer" architecture made concrete. Keep it to one sentence each, then rebuild the PDF.

### Sat 21:07 JST: Claims re-audit fixes: submission, README, AI_USAGE, briefing

claims2 re-audited every surface. Every tx is correct on-chain; the problems are wording, counts and stale lines. Apply the fixes in your files. The full table is in claims2's report; here's your part, with its exact suggested wording where it has one.

**docs/submission.md** (private, never add)
- Lines 107 and 315–316: "138" → **156** Foundry tests; there are 2 fork suites skipped without an RPC.
- Line 133: "seven live checks" → "seven checks" (check 4 is pending).
- Line 190, World feedback, "about 3 hours for IDKit sessions" → "about 10 minutes for World ID for Agents; IDKit sessions took until the evening: the first real proof passed only once we scanned with the iPhone Camera app."
- Lines 192 and 281: "today" → "Sep 26" / "The free plan backfills 100 blocks and keeps 72 hours".
- Line 193: add the World App scanner finding. It fails in World App's own scanner and works via the iPhone Camera app into the World ID app. Top improvement: route 4.0 session QRs to the World ID app, or say so in the error.
- Line 245: "mJPYC, our JPYC stand-in on Sepolia".
- Line 123 (and AI_USAGE, below): the Co-Authored-By sentence gets the honest exception: "except 32 made between 13:50 and 16:14 JST on Sep 26".
- Internal lines 47, 51, 55 and 161: update the counts (156; 10 Sepolia + 2 Awaji tx links; 18 settlement rows; World block ~240 words).
- §0 checklist, add: "git push HEAD before the flip"; "run `MANDATE_GATE=0x591dd2b2716b46740C665749A60209B7b22e83BF bash contracts/script/ens/verify-at-publication.sh` right after the flip"; "re-export ALL agent briefs and later instructions (briefs agent) before the flip".

**README.md**
- Lines 260 and 280: 156 tests, "(two fork suites are skipped without an RPC)".
- Lines 241–242: "verified on Sourcify at publication" is false today. → "their sources go to Sourcify when the repo is public (verify-at-publication.sh)". I'll flip it to "verified" after running the script.
- Line 264: "CompanyNamespace and MandateGate, added last, each went through review rounds of their own, with fork PoCs (docs/ens.md)".
- Line 109 is ens's; skip it.

**AI_USAGE.md**
- Line 11 ("every brief … committed verbatim"): leave it. We make it true by exporting all briefs before the flip, and it's in the §0 checklist.
- Line 13: the honest trailer exception, as above.
- Line 40: "Tested the demos; Karan records the demo video." Remind me to restore it after the upload.
- Optional: add services/signer, CompanyNamespace and MandateGate to the who-wrote-what table and the reviews.

**knowledge/Meigi-briefing.md:** lines 4, 22–23 and 130 (O8), 91 and 363 (only the five core contracts are Sourcify-verified), 128 (drop "(after the final deploy)"), 169 and 442 (156 + 570: agent 352, verifier 79, signer 36, guard 26, AI proxy 10, site Worker 67), 225 (O9), 270 ("at most one name"), 293 (mJPYC stand-in), 314 ("test-token payments"), 323 (Mizuhiki x402 done: 0x779c…959b), 587/589/661/663 (header time; drop the audit conditions; "on Sat 26 Sep").

**Optional wording:** "verified human" for the Agents sandbox approvals → "a human approves through World ID for Agents".

Commit README and AI_USAGE by path, rebuild the briefing PDF, and report.

### Sat 21:09 JST: The O8, O9 and header-time rows, verbatim

Here are claims2's three rows. Your O8 guess is right.

**O8, briefing lines 22–23, plus the demo row's fallback at :130.**
- Claim: "World ID for Agents approved a ¥55,000 payment … The agent itself holds no key".
- Verdict: OVERCLAIM, because the pairing implies the signer paid it.
- Evidence: 0xf155 was mined at 07:08 JST from 0xa73b at nonce 1. The signer's first commit is 3dc6f47 at 15:30, and the first signer-signed payment is 0x8ce2 at 15:47.
- Fix: "…approved a ¥55,000 payment on Sepolia (0xf155…0c48). Since that afternoon the agent holds no key: a separate signer does (first: 0x8ce2…0a46)."

**Line 4** is only the header time, "State as of … ~17:50 JST". claims2 grouped it with S10, not O8: make it "~20:35 JST", or the time of your rebuild.

**O9, briefing line 225.**
- Claim: "Selfie Check enrollment failed twice … so we used the Orb."
- Verdict: OVERCLAIM. It contradicts :218 ("the Orb is next"), and T7999900000002 has no officer on-chain.
- Fix: "…so the officer run uses the Orb, scanned with the iPhone Camera app (registration pending, on camera)."
- You may add that the first real Orb proofs passed tonight via the Camera app into the World ID app. That's true: the rehearsal officers were 0x8b843464… and then 0xdcf809aa…, verified by World's production API. But nothing is registered on-chain yet.

**S10, the header time and audit conditions: briefing lines 4, 587, 661, 589 and 663.**
- Claims: "State as of … ~17:50 JST"; "Use it once our audit confirms"; "disclosed an incident today".
- Evidence: the briefing holds items from 20:15–20:27, and the audit is marked done at :268.
- Fix: header "~20:35 JST" (or your build time); drop both audit conditions; "disclosed an incident on Sat 26 Sep".

### Sat 21:17 JST: Audit: remove/qualify "beats a 70B" in README, submission, sponsors, briefing

Thanks, good work on the claims pass. Your O8, O9 and header wording is fine.

**New finding.** benchaudit (`scratchpad/frontier/audit.md`) found that "our 0.8B beats a 70B LLM" doesn't hold as worded:
- about a third of the +10.3 comes from convention-dependent answers (+7.0 without them);
- Llama separates safe from unsafe better (AUROC 0.986 vs 0.944, CI excludes 0), and it's more accurate on the ≤1 vs ≥2 suspicion split (0.893 vs 0.833);
- tonight Claude Opus 5.5 and Fable 5.1 scored above our 0.8B, and are tied with our fine-tuned 4B.

**Fix these places:**
- README.md:95, the PayeeBench row;
- docs/submission.md:121 and anywhere else it compares with Llama;
- docs/sponsors.md:394 (private; don't add it);
- the briefing: 172, 396–399 (Q10) and 457.

**The honest version, for Q&A only:** "On our own synthetic benchmark the fine-tuned 0.8B has higher mean accuracy than Llama 3.3 70B, at 39 ms locally, but Llama ranks scams better and frontier Claude models score higher. That's why it only routes; the registry match decides."

Wait for bench's corrected ECE numbers before quoting any ECE. Commit README by path, rebuild the briefing PDF, and report.

AI_USAGE's who-wrote-what: services/signer was written by the apagent sub-agent; CompanyNamespace and MandateGate by the ens sub-agent. Add those rows.

### Sat 21:20 JST: Video kit updates from the dry run

Video kit updates (knowledge/07-video-kit.md) from the browser dry run (dryrun's report; screenshots in scratchpad/dryrun/shots/):
1. **Take D** runs on **http://localhost:5190/agent**, not 5173. I stopped the stale 5173 preview; apagent is adding 5190 to the agent's allowed origins. Its button now reads **"Ask a human to approve with World ID"** (0e3976e). It's reached via the **Try an example → 至急** chip.
2. **Take B** is now fast: about 0.04–0.1 s per check, not 5.4 s cold. The warm-up is optional.
3. **Timing cues:** the ▸ cues are on the "player clock", but the player shows no clock. Give video times as well (player − 0:24, since the recording starts at chip 1).
   - Re-cue chapter 5: "▸2:12 An unknown API gets a small, screened allowance. ▸2:17 One paying a flagged scam address gets nothing." That refusal is fully on screen for only about 1.4 s at 2:17.6–2:19.4.
4. **Take W:** don't click "Open in World ID" on the laptop, because it opens World's download page. Scan the QR with the iPhone Camera app.
5. **Take A:** toggle captions off (C) before starting, because the stage grows 907→968 px when you do. Stop within 8 s of the end card, because it loops to chapter 0.
6. **Take E and the /registry mandate sentence** are live; add them if they aren't there yet.

Keep the kit's other rules. No commit (private).

### Sat 21:20 JST: AI_USAGE line 11 wording for the full brief export

For AI_USAGE.md line 11, the briefs claim: the full re-export gets committed before the flip, so make the sentence exactly true for that state:

"Every brief and every later instruction the lead session gave to the agents that built, reviewed or documented the project is committed verbatim in docs/ai/briefs. Real people's names are redacted, marked [redacted: name].[redacted: private preparation] The §0 checklist item "re-export ALL briefs before the flip" makes it true.

### Sat 21:28 JST: AI_USAGE: it's eight excluded agents, not five

A correction to the AI_USAGE sentence I gave you.[redacted: private preparation] Make AI_USAGE line 11, and the submission's matching line, say:

"Eight agents that only prepared private notes for the team (a briefing, a judge critique, judge and speaker research, live event notes, talk transcripts, a Q&A sheet, a pitch document, and drafts of this disclosure) are listed there by name, but their briefs aren't published."

Commit it by path. Everything else in that sentence stays.

### Sat 22:12 JST: Add explorer.ens.dev as the ENS demo surface (briefing, kit, submission)

A new ENS demo surface, verified by me in the browser just now. [redacted: name] (ENS) pointed teams to the official Sepolia ENS Explorer, https://explorer.ens.dev/, which indexes the current ENSv2 deployment (the latest was on Sep 15). Our name shows there with everything:

- **Page:** https://explorer.ens.dev/t2011001234567.payee.eth
- **Description:** "株式会社メイギ商事 – Fictional demo supplier…"
- **Owner:** the company key 0xc33a…4638
- **Parent:** payee.eth
- **Resolver:** 0xe467…3ebd (ClaimedPayeeResolver)
- **Subregistry:** a "permissioned registry" 0x5063…9f95 (its CompanyNamespace)
- **Protocol:** ENSv2
- **Subnames:** 3 (ap, keiri, zeirishi)
- **History:** "registered subname" × 3 and "deployed and linked subregistry"

**Please add it:**
- **Briefing:** make it the ENS judges' first stop, ahead of app.ens.dev, since it shows the v2 structure (the permissioned registry and the issued subnames), not just the profile. Keep app.ens.dev as the second tab.
- **Video kit:** make it an optional ~10 s alternative for Take E.
- **Submission's ENS block:** one line, "See it in ENS's own Sepolia explorer: explorer.ens.dev/t2011001234567.payee.eth".

Also note it in the briefing for Q&A: some teams used old ENSv2 deployment addresses and couldn't see their names in the explorer. Ours are on the current deployment, and they show.

### Sat 22:14 JST: Agree: keep app.ens.dev at 1:10

Agreed: keep the 4-minute demo's 1:10 beat on app.ens.dev, since it's simpler for a mixed panel. The explorer is for the ENS judges and Q&A. Nothing else for now, thanks.

### Sat 23:02 JST: bench's corrected numbers are in (55bd6f1): ECE back in the briefing only

bench's corrected numbers are committed: d770ab5 (the ECE bin fix), 55bd6f1 (rescored, plus the frontier rows) and 95b5b43 (bench/README narrowed). If the ECE helps anywhere, put it back only in the briefing's Q&A numbers table, sourced from bench/results/RESULTS.md at HEAD, not in the public README or submission. Keep the frontier Claude rows labelled "Claude agent, batched (indicative)", as bench's protocol note says. The briefing lives outside the repo, so it doesn't need the recording freeze, but rebuild the PDF only once and quietly. Report back when done.

### Sat 23:04 JST: Soften the Llama wording to match bench's final stats

bench's final statistics soften two of the Llama claims we wrote, so update README.md:95, submission.md:121, sponsors.md:394 and the briefing (the numbers row and Q10) to match:
- **Binary suspicion (≤1 vs ≥2) is a tie, not a Llama win.** By top level it's 0.893 vs 0.833 (−6.0 pts, CI [−12.7, +0.7]); by probability mass it's 0.813 vs 0.833. Both intervals contain zero. Drop "Llama is more accurate on the suspicion split".
- **Ranking (p_safe AUROC 0.986 vs 0.944):** the edge holds item by item but not family-clustered (CI [−0.164, +0.007]). So say "Llama ranks safe versus held items at least as well", not "better".
- **The honest one-liner:** "On our own synthetic benchmark the fine-tuned 0.8B has higher mean accuracy than Llama 3.3 70B, at 39 ms locally; Llama ranks safe versus held items at least as well, and frontier Claude models score higher, so it only routes and the registry match decides."
- **"Safe/held", not "safe/unsafe":** 37 of the 99 held items are legitimate but need a person, so "unsafe" mislabels them.
- **The Jev price now has a source:** docs.typesafe.ai/models.md lists $0.042 per million input tokens, with output free. Use it wherever Jev's cost appears.
- **ECE for the briefing table** (from bench/results at HEAD): payee-0.8b 0.024, payee-4b 0.016, Llama 0.092, Kev-0.8B released 0.134.

Commit README by path, rebuild the PDF once, and report.

### Sat 23:08 JST: Karan's reading questions → briefing Q&A additions + 2 wording fixes

Karan is reading the briefing (up to p5–6) and raised judge-style doubts. Fold these into the briefing: new Q&A entries plus two wording fixes. Each answer is 2–3 spoken sentences. Source every fact from the repo or the knowledge files, and don't add claims.

**Wording fixes**
1. **The 0:00 beat opener:** "…and AI agents now read these emails" → "Finance teams, and now the AI agents they deploy, read these emails." That pre-empts "a finance team pays invoices, not an agent".
2. **The Curvegrid section:** delete "'policy-aware stablecoin payment agent', almost word for word" and any other "you described our project" glazing. Replace it with our real difference: the policy's key input (who gets paid) comes from a public registry tied to a government ID and is enforced on-chain; the agent holds no key; and its authority is an ENS name the company can revoke (live).

**New Q&A entries**
- **"Why an agent at all? Finance teams pay invoices."** The problem exists without agents: finance teams get fooled (JAL). Japanese banks protect transfers with the 名義 check before you send, and stablecoins have none, so Meigi adds it. Agents make it worse (they read the same emails and can be injected), and agent-to-agent (x402) payments have no finance team at all. Half the product needs no agent: the exchange withdrawal check, the router's pay-by-T-number, wallets.
- **"A T-number is just another hex."** It's printed on every qualified invoice (the payer already has it) and maps 1:1 to a company in the government registry. The resolver returns the registered legal name, checked as an exact NTA match, and the withdrawal check shows "Match · 株式会社メイギ商事 · T2011001234567". The .payee.eth form is for machines; people see the name.
- **"Companies already use multi-key custody. Aren't you worse?"** We're not a custody scheme; we're a layer on top. The business key stays in whatever custody the company uses; a payout change also needs the same enrolled humans, fresh, bound to that change, plus 72 h in public, so a stolen key alone can't quietly redirect money. Don't claim Safe/EIP-1271 support unless the code shows it.
- **"Why not just use a frontier model?"** The agent's LLM is pluggable, and Claude is supported (check the agent config for the exact provider name). Any model can be talked into a convincing bank-change email, frontier ones included, so the model only proposes and the vault decides. The small local model is only for routing cost, speed and privacy.
- **"Could every Japanese company get a name automatically?"** Every T-number already has an ENS name (wildcard), but it returns a payout only after the company registers, because the tax agency's data has no wallets. Serving all 5.8M legal names through ENS would need an off-chain CCIP-Read gateway: roadmap, not built.
- **"How do you prove the registrant represents the company?"** Honest: today we prove an exact name match, domain control and World ID officers, not representation. The production step is the 商業登記電子証明書 signed via gBizID (source it from 02-japan-primer). ZK "company email" proofs such as StealthNote prove membership of a domain, not authority to act.
- **(RWA angle) "What about invoice financing?"** "Verified payees are the missing primitive for invoice financing: you can't finance an invoice if you can't be sure who gets paid." Q&A only, nothing built.
- **Pronunciation note** near the top: 名義 = "may-ee-gee" (めいぎ), hard g.

Rebuild the PDF once, then report. It's a private file, so no commit.

### Sat 23:18 JST: After the Q&A additions: booth cards (World/ENS/Curvegrid) + Japan 名義 up front

Two more tasks, after the Q&A additions.

**1. A new private file, `knowledge/11-booth-cards.md`.** Karan wants to walk up to the World, ENS and Curvegrid booths tomorrow and not blank. Write one page per sponsor, each with:
- **the 30-second pitch:** what Meigi is, in their language;
- **3 things to show,** with exact URLs or commands:
  - ENS: explorer.ens.dev/t2011001234567.payee.eth, /registry/T4999900000005's mandate row, the revoke evidence tx;
  - World: tonight's 07 run (approve tx 0xf7507446…, wrong-human refusal), the officer registration once it lands, the debrief;
  - Curvegrid: the Mizuhiki Awaji deployment and its MJPY payments plus the x402 purchase, the live /api/settlements MultiBaas feed, and `scripts/ap-stack.sh --pause-signer`;
- **5 likely questions,** each with a 2-sentence honest answer;
- **the key facts:** addresses and tx hashes, from docs/ens.md, docs/mizuhiki.md, docs/world-*.md and the README;
- **their prize text,** and how we meet each requirement, one line each.[redacted: private preparation] Say why we use MultiBaas: event indexing without our own indexer, saved queries, REST. No glazing, no "almost word for word".

**2. Japan's own payee check belongs up front.** 02-japan-primer §4 has it, but Karan didn't know it existed. Put a 3-line version in the briefing's first 2 pages:
- the Zengin network carries 振込口座照会 (transfer-account inquiry, added Nov 1995);
- ATM 口座確認 has run since about 1980, and ことら has had 口座名義確認 since Oct 2022;
- what people see is the payee's kana account name before confirming, a display rather than a scored match like UK CoP.

End with: "That's the 名義 check we bring to stablecoins." Keep the primer's caveat that the exact on-screen display is common practice and unverified.

Rebuild the PDF once, then report.

### Sat 23:19 JST: Submission Curvegrid opener: keep the mapping, drop the glaze

Good calls on #20 (no Safe claim) and #22. On the submission's Curvegrid opener: keep the mapping, drop the glaze. Something like: "It covers two of the track's ideas, a stablecoin payment agent and a policy-aware transaction agent. The policy's key input, who gets paid, comes from a public registry tied to a government ID and is enforced on-chain; the agent holds no key; and its authority is an ENS name the company can revoke." Then continue with the booth cards and the Japan 名義 up-front section.

### Sat 23:29 JST: Great; bump header on next rebuild; more from the judges soon

Great work on the booth cards and the Japan payee-check section. Yes, bump the briefing header time on the next rebuild. The next edits will come from tonight's judge reviews: a finalist round 2, the World, ENS and Curvegrid judges, the fresh-clone engineer and the explainer (`knowledge/13-say-it.md`). I'll send you what applies to your files. Hold until then.

### Sat 23:36 JST: Finalist round-2 fixes: briefing, demo-script, submission, booth cards, kit

The finalist round 2 is in `knowledge/12-finalist-round2.md`. Read it; the exact replacement wording is there. Apply it to the briefing, docs/demo-script.md, docs/submission.md, 11-booth-cards.md and 07-video-kit.md:

1. **Q5, "was it AI-built?"** The current answer claims four contract decisions as ours (refuse instead of warn, a second claim freezes, no key in the agent, 72 h), and none is in Karan's drafted calls list. Replace it with round 2's version, tied to real timestamped calls (14:37: World must be a real use, not a login; 16:22: a plain ENS name isn't enough; the Orb scan; tonight's live test), and state honestly that AI wrote the code.
2. **The World ID beat.** Name tonight's run: a different World ID identity was refused at 22:15, then the enrolled approver paid ¥55,000 through the gate (0xf7507446…5a03). Add the prep trap: the signer refuses approvals made within 60 s of its start, so don't restart the stack right before this beat.
3.[redacted: private preparation] Keep x402 for Q&A and the Curvegrid booth.
4. **The registry beat** must not claim World ID officers on the placeholder fixture. Once T7999900000002 registers, show that instead.
5. **Rival line.** "Everyone else here puts a leash on their own agent" → "Most agent-payment guards leash their own agent…", then name the Monday user (exchanges, wallets, AP teams). Apply it everywhere, including README if present, committed by path.
6. **The close.** Show the QR `<workspace>/knowledge/try-qr.png` (it opens https://meigi.karanbishttt.workers.dev/try): "Open this on your phone and tap Run it live: the vault refuses the scam, on your phone, with nothing installed." Add it to the briefing's demo order and the demo script.
7. **Overclaims:**
   - "a different human refused" → "a different World ID identity";
   - the mandate "refused on-chain" → "the contract refused it (checked in simulation; nothing was sent)";
   - "can't be squatted" applies to the ENS name, not the payout;
   - "any ENS client" → "stock viem, ENS's own app and explorer";
   - "officers are verified humans" only once T7999900000002 is registered.
8. **Submission World evidence:** lead with tonight's live run (the refused different identity, then the approved and paid 0xf7507446…, block 11786455, with docs/world-agents-approve-run.md). Keep the older ¥55,000 tx 0xf155 only as history.

Rebuild the PDF once, bump the header time, commit README by path if touched, and report.[redacted: private preparation]- **Evidence:** the World form currently links the 07:08 tx 0xf15571d7, which the agent's own key sent before the signer existed. Link 0xf7507446…5a03 and docs/world-agents-approve-run.md instead.
- **What the run shows:** mention the live refusal of a different World ID, and the signer's second, independent check of the approval.
- **"Phase 2, opt-in"** → "on in our demo stack".
- **Orb:** say plainly that the real IDKit runs used Orb because Selfie Check failed in the app.
- **IDKit officer run:** until it lands, keep it marked pending. Once it lands I'll send the txs.
- **Video take list:** Take W (the registration) is now mandatory, not optional, and includes the decline beat.

Rebuild once with the round-2 edits, then report.

### Sat 23:46 JST: ENS + Curvegrid judge fixes for README and submission (queue after World items)

More from two judges; queue this after the World items.[redacted: private preparation]- Replace the first paragraph of the ENS form answer with §3.2's text verbatim. Cut the mandate sentence from "Companies issue names…", and end the answer with the name map.
- Add the CompanyNamespace and MandateGate sentences to "How it's made", and put the mandate links first under Evidence.
- Code link: `contracts/src/ens/CompanyNamespace.sol#L155-L198` as the primary, and `MandateGate.sol#L78-L82` as the first evidence link, instead of PayeeResolver.sol#L41. Keep blob/main links; I pin them to the final commit at the freeze.
- Apply §5's items 1–6 and 8 wherever the README or submission has them:
  - "refused on-chain" → "the gate refused it before anything was sent";
  - "fully own their data" → the Limits sentence in §5.3;
  - "until 2026-12-31" → "the end of 2026 (UTC)";
  - 48/48 or 30/30 → the 7 fork tests.
- ens is fixing docs/ens.md itself.[redacted: private preparation]- README line 5: the one-sentence summary becomes one sentence. Use its text, and move the NTA/DNS/World ID detail to the next paragraph.
- Team lines: restructure to the judge's format. Keep only real values: Karan's GitHub is @KaranSinghBisht. Leave the others as `<TODO: Karan>` for me to fill once Karan gives the handles. Don't invent any.
- README "What reads it" → its replacement text.
- "Six saved queries" → "Seven" everywhere, adding the `meigi_mjpy_transfers` line.
- Submission:
  - "settlement ledger" → "settlement index";
  - the evidence link `/try` → `/agent`;
  - the Curvegrid section's ¥55,000 evidence → 0xf7507446…5a03, keeping 0xf15571d7 only as "history";
  - add the custody-and-recovery paragraph (fix 4) and the three Awaji tx links to README §Curvegrid.
- Overclaims:
  - the x402 buyer is a scripted buyer with its own key, never "keyless" or "an LLM";
  - on Awaji, it's "the registry and router", not the agent;
  - MultiBaas indexes "since we linked it" (block 11,783,796).
- docs/sponsors.md is private and untracked; never `git add` it. Fix the three stale lines from fix 3 there too.
- Leave services/*/README.md to apagent.

**Don't mention "Ask the ledger" anywhere.** It stays off unless the 09:00 smoke test passes.

Commit by path in small commits, then send me the hashes. If you're low on context, say so and I'll split this off.

### Sat 23:53 JST: I own 07-video-kit.md now; Matsuri line fixed in briefing; include in next PDF rebuild

Two coordination notes:
1. **I've taken over knowledge/07-video-kit.md.** It's restructured for the silent recording, with Take E as a live revoke and me doing the cut. Please don't edit it further; send me anything you'd have changed there.
2. **I edited knowledge/Meigi-briefing.md** in the [redacted: name] opener (~line 724): the Matsuri "no merchant verification" quote is gone, because it refers to voucher redemption and he merged that README. Keep that edit, and include it in your next PDF rebuild.

The explainer may also touch the briefing; I'll tell it the same.

### Sat 23:55 JST: Fresh-clone findings for README "Run it locally" (same README pass)

The fresh-clone engineer passed us, narrowly (`knowledge/17-fresh-clone.md`). Fold its README items into the same README pass. You're README's single owner tonight, so nobody else edits it. Items:
1. **"Run it locally":**
   - Suggest `git clone --depth 1`, and add `git submodule update --init --depth 1 contracts/lib/forge-std contracts/lib/openzeppelin-contracts` before `forge test`. That takes the contracts step from 6:09 to 11 s, and the full clone is 320 MB of screenshot history.
   - Mention `pnpm -r typecheck` and Node ≥ 22.18.
2. **Lead "Run it locally" with the no-secrets stack:** anvil, signer, agent, then `demo --force`. The steps are in services/agent/README.md.
   - Include `touch .env` first; without it the scripts crash on `--env-file`.
   - Include `TRIAGE_REQUIRED=false` if Kev or Ollama isn't running.
   - Move the verifier, ap-stack.sh, x402-demo and multibaas:setup under a "Demo machine (needs our keys)" heading. Say plainly that they need keys we don't publish.
3. **README.md:95** credits 0.918 to "Kev-0.8B". RESULTS.md has payee-0.8b (our fine-tune) at 0.918, and the Kev base model at 0.747. Fix the name.
4. **README.md:19**, the team: the `<TODO: Karan>` placeholders as agreed. I fill in the real handles at the freeze.

Don't touch package.json scripts; apagent is adding a root `.env.example`. Commit by path, then send me the hash.

If your context is getting tight, tell me now and I'll hand "Run it locally" to a fresh writer once your README commit is in.

### Sat 23:58 JST: Kit notes already handled; make the quorum line explicitly not-yet-enforced; continue queue

Thanks. Your kit notes were already handled in my rewrite: silent pre-flight, I do the export, Take E points to 18-take-e.md, and no off-camera /change rehearsal. worldui's production proveSession probe covers the request side.

**The quorum line:** keep the stance, but make it unambiguous that it isn't enforced, e.g. "A multi-officer quorum should need Orb; today a deployment accepts one credential set (server.ts), so that rule is production work." worldui is fixing the same claim in the repo docs.

Then continue with the ENS, Curvegrid and fresh-clone items, in that order. Send hashes when you commit.

### Sun 00:02 JST: Fork tests are now 8, not 7

A small correction for the ENS items: ens added a no-aliasing fork test (a333a3d), so the repo now has **8** fork tests, not 7.
- Wherever you cite the in-repo fork tests instead of 48/48 or 30/30, say 8.
- You can also cite that test for "no aliases, on purpose": a company registry mounted under a second parent resolves to nothing.
- forge now runs 156 passed, with 2 fork suites skipped without an RPC; with an RPC, 164 pass. I update counts at the freeze.

### Sun 00:09 JST: Great batch. Yes to AI_USAGE harness note; hold test counts for the freeze; rebuild PDF now

Excellent batch: 7437919, cf4a7ef and 925cbf6 are noted. Each place you went with the sources over the judges was the right call. Decisions:
1. **AI_USAGE.md:55-56:** yes, add "(the harness isn't in the repo; CompanyNamespaceFork.t.sol and MandateGateFork.t.sol are)". ens's no-alias test is committed (a333a3d), so the repo has 8 fork tests. Commit by path.
2. **Test counts:** hold them until the freeze. They're still moving: the agent is at 361 and the verifier at 86 after tonight's commits. I'll run the full check on the final HEAD at the freeze (~02:15) and send you one set of numbers for the README, submission, AI_USAGE and briefing in one pass.
3. **Briefing PDF:** rebuild it now with everything since 23:57. That includes my two edits: Q21 now says Gemma 4 on stage and Claude is a setting, and the Matsuri line is gone. Then rebuild once more after the freeze counts.
4. **.env.example:** apagent commits it after the 00:20 restart checks. Link it in "Run it locally" when it lands; I'll forward the hash.

Karan's handles come in ~00:30; I'll send them for the `<TODO: Karan>` slots.

### Sun 00:12 JST: AI_USAGE: yes, commit the harness pointer now; ens's fork test IS committed (a333a3d)

Two answers, in case my last message crossed:
- **AI_USAGE.md:55-56: yes.** Add the pointer "(the harness isn't in the repo; CompanyNamespaceFork.t.sol and MandateGateFork.t.sol are)" and commit by path now.
- **ens's no-alias fork test is committed** (a333a3d), so the repo has 8 fork tests. It doesn't change any count you cite.

After that, stand by for the handles (~00:30) and the freeze counts (~02:15).

### Sun 00:18 JST: Explainer pre-sweep: briefing §2 Say column → 13's; "tonight" lines; forge 164/8 counts

The explainer's pre-sweep found three things for you; please do them now:
1. **The briefing's §2 demo table, Say column:** it still has lines that 13-say-it.md fixed:
   - 0:00 "forty hex characters";
   - 0:20 "Our agent's language model believes it" and "the tax ID printed…";
   - 0:50 "names the only address this company can be paid at", from our own never-say list;
   - 1:10 "5.8 million company records";
   - 1:40 "→ **Pay**": there's no Pay click, it pays on approval;
   - 2:25 "This is what an exchange runs" and "Live, from the public site".
   The simplest fix is to copy 13's Say column and screen notes verbatim for those rows, so the two can't drift.
2. **Spoken "tonight"** in the briefing, since it's Sunday when he speaks: L146 (1:40), L148 (2:55 "We revoked it tonight"), L153 (the 1:10 officer swap) and L421 (Q6) → "last night". I've already fixed the booth cards.
3. **Forge counts,** which are stable now: 164 test functions, 8 of them fork tests (CompanyNamespaceFork 7, MandateGateFork 1), so 156 run without an RPC.
   - docs/submission.md:41-42 says "163 test functions… 7 tests" → 164 and 8.
   - README:286 says "156 Foundry tests in all" → "164 in all; 156 run without an RPC". Commit it by path.

The service counts still wait for the freeze. Rebuild the PDF once after 1 and 2.

### Sun 00:21 JST: 13 wins on all four drift points; yes, sync demo-script.md

fbbfa78 and the 00:20 PDF are noted: thorough work. On the drift you found, `13-say-it.md` wins everywhere it speaks:
1. **Pronunciation:** use 13's "MAY-ghee ('ghee' like the butter, hard g)". In natural speech めい is a long "may", not "may-ee".
2. **Hex:** any line Karan says aloud (the §1 hook, talking point 2) uses "forty random characters". Written reference material can keep "hex".
3. **Timing:** the §2 intro becomes "≈3:45", matching 13.
4. **demo-script.md (private): yes.** Copy 13's rows in word for word, so no stale script is lying around. Never `git add` it.

Rebuild the PDF once after 1–3.

### Sun 00:25 JST: .env.example landed: 37d642d — link it in "Run it locally"

The root `.env.example` is committed in 37d642d, and I scanned it: no secrets, only public values. In "Run it locally", link it where the keyed services start ("Copy .env.example to .env; the demo machine fills in the keys we don't publish"), and in the no-secrets stack, `touch .env` can stay. Add apagent's note: without World credentials, start with `SIGNER_VERIFY_APPROVAL=0 scripts/ap-stack.sh`, since Phase 2 is now the default and needs the issuer and client id. Commit by path.

### Sun 04:16 JST: Handles from Karan — fill README team lines now (no invented bios)

Karan's handles, exactly as given:
- **Karan Singh Bisht:** GitHub @KaranSinghBisht, X https://x.com/karan_Bisht09
- **Adithya Prasanna Suriya Prakash:** X https://x.com/apsp2k5. No GitHub handle was given, so leave GitHub out for him. Don't guess one.

In the README team lines:
- **Replace the `<TODO: Karan>` slots.** Drop the "<what you built>" descriptions entirely rather than invent them: names plus handles is the intro.
- **Wording:** in the one-sentence summary, "government-issued invoice number (T-number)" → "government-issued invoice registration number (T-number)". The explainer found that "invoice number" is heard as the invoice's own serial number.
- **The submission's team block,** if it has one: use the same handles.

Commit by path, send me the hash, then grep that no `<TODO` remains anywhere in tracked files.[redacted: private preparation] Two tracked lines:
1. **Now (docs only, no HMR risk):** `docs/landing-spec.md:4`.[redacted: private preparation]
2. **Only after I say the recording is done:** `apps/web/src/features/home/ascii/useAsciiCanvas.ts:1-5`.[redacted: private preparation] apps/web is frozen while Karan records on :5190, so wait for my go. Then rewrite it to describe only what the file does, e.g.:

   "A glyph grid on a canvas, shared by the start page's ASCII pieces: DPR scaling, resize, a pause while the canvas is offscreen, and a single still frame when motion is reduced. The cell comes from the font's own advance, strings draw in one call (Japanese is wider than a cell), a still frame is a chosen moment of the loop rather than its first, and fonts that arrive late redraw it."

   No provenance claim either way. Change the comment only, then typecheck and commit by path.[redacted: private preparation] Tell me any other hits, except bench/scripts/external.

### Sun 04:28 JST: Agreed: leave history alone; item 2 after recording

Agreed: history stays as it is. A rewrite would break every hash our links point at, and ETHGlobal reviews commit history, so a rewritten history looks worse than an old commit message. I've told Karan it's there. Hold item 2 until I say the recording is done. aa16789 is noted.

### Sun 04:55 JST: Yes to the README live-run bullet; alternative path = S4b rotation decline (pending); explainer does 13

Good. Decisions:
1. **README: yes,** add the live-run bullet as written, and commit by path.
2. **The alternative path is S4b:** Karan declines a "Replace a lost business key" (ControllerRotation) request on T7999900000002 with World ID. worldui watches verifier.sqlite and fills world-live-run.md 7.1 when it lands, or marks it "not recorded" at 05:30. Only when worldui confirms it, update the submission's IDKit line to "live: an officer's decline on a key-rotation request ('Declined. Nothing was approved.'), and the different-human denial in a verifier test", and close the §0 open item. Until then, keep it as it is.
3. **13-say-it.md:** I'm asking the explainer to apply its own [PENDING] swaps.
4. **Freeze counts and the useAsciiCanvas comment:** I'll send both at the freeze, ~06:00.

### Sun 04:55 JST: GO: useAsciiCanvas.ts comment (recording is done)

Recording is done, so apps/web edits are allowed again. Go ahead with the useAsciiCanvas.ts comment: the neutral wording, comment only. Typecheck, commit by path, then re-run the provenance grep and report the hash.

### Sun 05:31 JST: Explainer's final-sweep fixes + align video description to the real cut

From the explainer's final sweep (05:05), please fix these now:
1. **Briefing §2, 1:10:** the L145 row and the L152–157 note. Copy 13-say-it.md's 1:10 row verbatim. It opens /registry/T7999900000002 and says "this morning". It must NOT imply ソラノ精機 passed the NTA name match or the DNS proof; office-9999 fixtures skip both, and only the officer is real.
2. **Booth cards L63–65:** the "video's Take W … declines one proof…" line is wrong. The final video shows no decline. Replace it with: "On record, live on World ID production: the registration and a proveSession approval that queued a payout change; a different human is denied in a verifier test."
3. **submission.md L32 and L315:** drop "with a declined proof". Then describe the video as it's actually cut (3:12):
   - problem;
   - live agent: fooled → HOLD → vault refuses, plus MultiBaas settlements;
   - registry and ENS;
   - the World ID officer run, live on production: register, then an approved payout change queued for 72 h;
   - World ID for Agents: a different identity refused (recorded run), then a live approval that pays;
   - x402 refusal;
   - ENS mandate: explorer history of yesterday's revoke/re-issue, plus a payment while it answers;
   - exchange check;
   - /try.
4. **Also:** keep the §0 "IDKit alternative path" item honest. No live decline was recorded, so it's "a different human is denied in a verifier test".

Rebuild the briefing PDF once after these. Commit only tracked files, by path, and send me hashes. The freeze starts ~05:45.

### Sun 05:45 JST: Freeze counts are final = same as you have (156+2 / 164 / 8 fork; 594 services)

The freeze check at 0590557 passes everything. The counts are final and match what you already have:
- forge: 156 passed, 2 fork suites skipped without an RPC; 164 with one, 8 fork tests;
- services: agent 361, verifier 86, signer 44, x402-guard 26, ai-proxy 10, Worker 67, which is 594.

If any doc still has an older number, fix it; otherwise nothing changes. I'll send the final commit hash for the submission's pinned links in ~30 min, after the prompts and briefs commits.
