# demo: Build the animated demo player

Agent type `oh-my-claudecode:designer`, started Sat 12:32 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You're joining the Meigi team at ETHGlobal Tokyo 2026 (today is 2026-09-26; submission is Sun 09:00 JST). Meigi is "Confirmation of Payee for stablecoins and AI agents": a company's official registry number (a Japanese T-number) is bound on-chain to one payout address. An AI accounts-payable agent pays suppliers in JPYC from an on-chain vault, which refuses any address that isn't the registered payout.

Repo: <workspace>/meigi (pnpm monorepo; the web app is apps/web: React 19, Vite, react-router, GSAP, R3F scene from packages/scene).

YOUR JOB: build the animated, fully recorded demo player described in **docs/demo-storyboard.md**. Read it first; it is the spec. Karan (the founder) wants "things happening on screen": a Mac-style browser window with a Gmail-like inbox, the agent visibly reading the mail beside it, the pipeline filling in, the chain refusing, a human approving via World ID, and agents buying compute over x402. Every value shown must come from real recorded runs.

**Ownership (other agents are editing the app in parallel):**
- **Yours:** a new folder `apps/web/src/features/demo/` (components, timelines, data, css), plus a route `/demo` registered in the app's router. Find the router file, make only the minimal addition, and mention it in your commit.
- **Embedding:** export a `<DemoPlayer />` usable in two ways: full-screen at `/demo`, and embedded in the hosted agent console. For the embed, change only `apps/web/src/features/agent/AgentHosted.tsx`: replace its static recorded run with the player. Keep a link to the full-screen version.
- **Don't edit:** `apps/web/src/ui/*` (another agent is porting new "liquid glass" tokens into ui/styles/glass.css right now; use the existing classes and CSS variables, don't restyle them), `features/x402` (another agent), or `packages/scene`.
- **Visual language:** see /Users/kryptos/.claude/projects/-Users-kryptos-Desktop-Projects-ethtokyo/memory/meigi-design-rules.md.
  - see-through Apple-like glass; no white strokes, no coloured accent edges, no gradient banners;
  - one size scale (controls 36/44/52, radii 10/16/24/pill);
  - solid ink primary buttons.

  The macOS browser chrome and the mail client are "props" inside the scene, so they can look like a real Mac window and a familiar webmail. Don't use Google's name or logos: call it "Mail".

**Data (real only):**
- **Chapters 1–3:** `apps/web/src/features/agent/recorded/` (bec-document.txt, bec-analysis.json, bec-pay.json), parsed by `features/agent/recorded.ts` and `lib/api/agentParse`. Reuse those parsers.
- **Chapter 3's reply draft:** the Japanese text is given in the storyboard; it's fine as scripted copy.
- **Chapter 4 (World ID for Agents approval):** the real paid tx `0xf15571d7c0adcab8e7ac845379c87c466f85c1c98a90ba41e1987a23dba10c48` (¥55,000 to 0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4). The token facts: acr orb-v3, a fresh auth_time, single-use approval bound to the invoice.
  - The phone mock is a neutral "World ID · approve" screen, not a copy of World's app.
  - For the 至急 invoice mail, use `services/agent/scripts/demo-invoices/07-urgent-invoice.ja.txt`.
- **Chapter 5 (x402, agents buying GPU compute and datasets):** another agent ("worldui") is building the marketplace and will record a real run as JSON in services/x402-demo. Build the chapter against a typed interface with a clearly marked placeholder fixture. Ask me (the lead) for the recorded JSON path when you get there; I'll relay. Real existing txs you may use meanwhile:
  - honest x402 purchase `0x3146ec4fa1c89a192f8585f315c720724587f404e3d5e7e6cdfd341b825debd6`;
  - refusal text: "t8999900000001.payee.eth resolves to the registered payout 0x0C1d…578D, but payTo asks for 0xdCa5…6d5b instead".

**Behaviour:**
- Autoplay, loop, chapter chips, play/pause, replay, speed ×1/×1.5.
- One central GSAP timeline per chapter, driven by a clock, so chapters can be jumped to.
- `prefers-reduced-motion` turns it into a Next/Back step-through.
- Captions on by default, with a toggle.
- 60 fps at 1440×900 and 1920×1080; usable at 1024. On phones, show a simplified vertical version: panel under the browser, captions on.
- Japanese renders well (Noto Sans JP, or whatever the app already loads).

**Code rules:**
- files ≤ 400 lines, functions < 50 lines, no console.log;
- handle errors explicitly;
- organise by feature;
- TypeScript strict, and `pnpm --filter @meigi/web typecheck` must pass.

**Commits:** commit as you go with Conventional Commits, `git add` by path only (never `git add -A`: others have work in progress). End each commit message with:
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HAsqcAGquPFh83q8WqHVcu

**Checkpoints:**
- in about 40 minutes: chapter 1–2 running;
- then chapters 3–4;
- then 5 and the end card.

At each checkpoint, save screenshots (Playwright is in apps/web's devDependencies; run the dev server on a spare port, not 5173) to <scratchpad>/demo/ and message the lead ("team-lead") with the paths and a 3-line status. Never print secrets from the repo's .env.

## Follow-up instructions

### Sat 12:49 JST: Add Chapter 0: a company onboards (Karan's idea)

Karan has a new idea for the demo. Add a **Chapter 0, "A company joins Meigi"**, before the inbox chapters, after you finish your current checkpoint. In the Mac browser, a polished onboarding wizard at `meigi…/register`:
1. Type T-number T2011001234567; the legal name 株式会社メイギ商事 auto-fills from the registry, and the ENS name t2011001234567.payee.eth appears live.
2. Connect the business wallet, and "Create a new payout wallet" → 0x9B4f…47e4.
3. The domain TXT record → verified.
4. An officer enrolls with World ID (QR → approved).
5. Review → "Register" → registered on Sepolia.
6. "You're verified": a payee card with a QR, "✓ resolves in any ENS client".

Caption: "Verify once: a company binds its registry number to one payout." Then Chapter 1 continues ("…now its customer's AI agent can pay it safely").

Real data: Meigi Shoji's registration on Sepolia is in the registry event feed. Find its tx hash via the PayeeRegistered event on registry 0x205c977cF1f4Ed42e51a48759550eF40160A6396 (from block 11781105) with viem, and show it.

Another agent ("onboard") is building the real wizard in features/register right now. Match its look loosely, but build your own lightweight replica inside features/demo; don't import from features/register, which is changing. Also update the Chapters section of docs/demo-storyboard.md with this chapter when you commit.

### Sat 13:06 JST: Checkpoint 1 looks great; answers on 0940 + x402 data

Checkpoint 1 looks excellent: the Mail client, the pipeline and the captions all read beautifully. Answers:
- **Ch4:** the mail should show **MS-2026-0940**, so it matches the real tx's invoiceRef. Every value real.
- **Ch5 data:** worldui recorded a real research-agent run on Sepolia (3 settled, 2 refused). It's committed in 0cc7890 under `apps/web/src/features/x402/`: `recorded.ts` plus its data import. Copy the recorded data into `features/demo/content/`; don't import the x402 component, which may change. Real tx hashes in it include `0x24b128e8…b3f1`, `0xce9c6cf8…2a34` and `0x48d3d33a…e3d3`.
- **Ch0 (onboarding)** is still wanted, before Ch1.

Carry on with chapters 3–6 and Ch0, and send checkpoint 2.

### Sat 13:19 JST: x402 recorded run: apps/web/src/features/x402/recorded.ts

Checkpoint 2 sounds excellent; I'll look at the shots. The real x402 run is **inline in `apps/web/src/features/x402/recorded.ts`**: an exported constant typed as `ScenarioResult` from `apps/web/src/lib/api/merchant.ts`. It's the Sepolia research-agent run: 3 settled (2 GPU-minutes from 株式会社ミナトGPUクラウド T6999900000003, 1 dataset slice from Fuji Data T8999900000001) and 2 refused before signing (the compromised GPU mirror with the ENS-mismatch message, and the undeclared web scrape). Copy the values into your `content/x402.ts`, mapped to your X402Run type (don't import the x402 module, which may change), drop the PLACEHOLDER labels, and commit. Also make sure Ch0 (onboarding) is in, then send checkpoint 3.

### Sat 13:19 JST: cp2 looks superb — two small fixes

Checkpoint 2 looks superb: the 拒否 seal and the World ID phone are exactly the "happening on screen" Karan asked for. Two small fixes:
1. **The chain log carries Ch3's PayeeMismatch lines into Ch4** (visible at t=72.9 while the human approves). Clear the log at each chapter start, or dim the previous chapter's entries under a divider, so Ch4's log shows only its own story, ending in the Paid tx.
2. **The recorded BEC explanation credits "llama-3.3-70b-instruct-fp8-fast"** (that run predates our switch to local gemma4). I'm having apagent re-record `features/agent/recorded/bec-*.json` with the current stack. When it lands, just re-run your content build, no code change. Until then, keep the model name as recorded; never relabel it.

### Sat 13:27 JST: x402-run.json is in place — do the one-line swap

The real run is at `apps/web/src/features/demo/content/x402-run.json`, exported verbatim from worldui's recorded Sepolia run: a ScenarioResult with 5 steps, 3 settled (0x24b128e8…, 0xce9c6cf8…, 0x48d3d33a…) and 2 refused. I've placed it but not committed it. Do your one-line swap (`X402_RUN = fromScenario(json)`), remove the placeholder labels, and commit both files by path. Also fix the 390px clipping webapp flagged: its checker reports div.dstage at 364 of 501px, section.mac at 400 of 564px, and the mail and message scrollers clipped. If that's intentional internal scrolling, make sure nothing important sits in the cut-off area. Then send the final checkpoint, including Ch0 onboarding.

### Sat 13:56 JST: Final cp approved + 2 honesty fixes in Ch0

Final checkpoint approved. Ch0 with the real PayeeRegistered panel is lovely, and I agree with your Ch4 judgment call (drop the kernel card rather than show unrecorded checks). Two honesty fixes in Ch0 before it's done:
1. **The domain row says "meigi-shoji.example · proven", and that isn't real.** 株式会社メイギ商事 was registered by the seed script as a fictional fixture, with **no** domain proof. Its on-chain evidence is keccak("demo-fixture:fictional-vendor:not-an-NTA-company"). Show "Domain · skipped (fictional demo company)", and label Evidence "fixture evidence (fictional company)" instead of "hash of the verification bundle". In the wizard replica, show the domain step as "Demo companies skip this step", as the real wizard does.
2. **Wording, per our compliance review:** "You're verified." becomes "You're registered.", the rail item "You're verified" becomes "Registered", and any "Verified payee" label becomes "Registered payee". The real wizard is getting the same change. "Resolves in any ENS client" stays.

Commit by path. After that the player is done. Thank you, it's excellent.

### Sat 14:05 JST: BUG (Karan): pause + change chapter → stage blank

Priority bug from Karan, on the live site: **when he pauses and then clicks a chapter chip, the player "hangs and doesn't show the view"**. His screenshot: paused ("Play" showing), chip 1 "Bank-change email" active and its caption visible, but the stage is empty. Neither the Mac browser nor the agent panel renders, just the Fuji backdrop.

Likely cause: seeking a paused GSAP timeline doesn't apply the state that callbacks or `from` tweens set up. For example, `onStart`/`call()` callbacks that mount or show elements get suppressed on seek, or visibility is toggled by callbacks rather than `.set()` tweens.

Fix: make every visual state seekable. Use `tl.set()` or tweens for visibility, mount and class changes, not callbacks. When seeking while paused, use `tl.seek(t, false)` so callbacks aren't suppressed, or re-derive the chapter's state from the clock. Test pause → each chip 0–6, and scrubbing via `?t=…&paused`, at 1440 and 390.

Also still open from my last message: the Ch0 honesty fixes (domain "skipped (fictional demo company)", "fixture evidence" label, "You're registered" / "Registered payee"). Commit both by path, then tell me so I can redeploy.

### Sat 14:12 JST: Great catch on the placeholder officer; yes, switch to 'Register once'

Great catch on the placeholder officer. That's exactly the rigor we need, and the grey dashes plus the honest caption are right. On your two questions: yes, switch both, for consistency with the compliance wording. Ch0's opening caption becomes "Register once: a company binds its registry number to one payout.", and the end card becomes "registered once, and checked on every payment". Commit by path. The pause-then-chip bug fix is the other open item; tell me when both are in and I'll redeploy.

### Sat 15:14 JST: Ch0: sync 2 lines + frame it as "how the wizard works"

Decision on onboard's honesty flag for chapter 0. The demo company was registered by our seed script directly, so ch0 mustn't read as that company's real onboarding.
1. **Sync the two lines that changed after 92a7c22:**
   - step 4's demo-company note (1667c46): "A demo company is fictional: it has no NTA record and no domain to prove.", then what a real company's registration proves;
   - the last screen for 株式会社メイギ商事 (6949891): "It's registered." plus the placeholder-officer line.
2. **Frame ch0 as a walkthrough.** The opening caption says it shows how the wizard works, using the demo company's registration on Sepolia. Something like: "How a company joins Meigi, shown with our demo company's record on Sepolia." Keep the wallet connect/create animation as illustration, but don't claim it happened. Keep the rest of the chain panel (real tx, block, payout) as is; that part is real.
3. **Later, not now:** after Karan's real World ID run registers T7999900000002 through the live wizard, ch0 could switch to that run's data and become a genuine replay. I'll decide once the recording exists.
Keep the loop under about 2:35. Commit by path.

### Sat 15:18 JST: B, now; real clicks come back with the real World ID run

**B.** Mirror the hosted replay for this company, with its strings verbatim: no Connect/Create/Register clicks, and the real PayeeRegistered tx shown as the record. Keep the motion (screens advance, the rail fills, the registry panel fills row by row). It supersedes my "keep the clicks as illustration" note; your reasoning is right that a Register click followed by a real tx implies cause and effect, and Karan explicitly asked for the video and /register to tell the same story.

**The clicks come back truthfully later.** Karan's real World ID run registers T7999900000002 through the live wizard: a connected wallet, a created payout, a World ID officer, Register, then the real tx. worldui records it as `source: 'wizard'`. When it lands, both /register?replay and ch0 switch to that run, with every click real. Build ch0 so that swap is a data change, like onboard's recording.ts.

Ship B with 1c8527d, commit by path, and tell me.

### Sat 15:36 JST: Heads-up: git history rewritten; all hashes changed

Heads-up: at 15:33 I rewrote the repo's history, with Karan's go-ahead, to drop three internal prep docs from every commit, and force-pushed main. **Every commit hash changed.** Trees are identical, and your working tree and uncommitted edits are untouched. main = origin/main = 12f8e40. Get current hashes from `git log`, and find old work by subject with `git log --oneline --grep`. Don't gc or prune, and keep committing by path.

### Sat 16:10 JST: Invoice 07 renumbered MS-2026-0926 → MS-2026-0931 — check demo content

Heads-up from apagent: example **07** (the ¥55,000 至急 invoice needing a human) had invoice number **MS-2026-0926**. That collided with a ¥33,000 evidence invoice paid live at 15:05, so on Sepolia 07 now holds as `invoice_already_paid` and can't be paid. apagent is renumbering 07 to **MS-2026-0931**. Check the demo content (chapter 4, captions, the mail replica, content/*.json, the storyboard) for MS-2026-0926 or any 07 invoice number. Recorded runs showing a *past* real payment keep whatever number that tx actually committed to (the ¥55,000 tx 0xf15571d7… used its own invoiceRef; don't change recorded facts). Only change references to what 07 is *now*. Report what, if anything, you changed.

### Sat 16:50 JST: Site audit: gate the end card's GitHub link on env.githubUrl

A site audit found that the /demo end card's GitHub link (`features/demo/stage/Overlays.tsx:46`, hard-coded `https://github.com/KaranSinghBisht/meigi`) 404s while the repo is private. The flip is around 03:00, and Karan may record the video before then. Gate it like BusinessPage does: render the link only when `env.githubUrl` is set (the deploy passes `GITHUB_URL`, and we'll set it at the final deploy after the flip). The end card must still look complete without it. Commit by path. Thanks for the video kit and the record-ready fix; both are deployed (257277d).

### Sat 16:56 JST: Sync ch0 payout-change captions (audit honesty fix) — urgent before recording

Urgent before Karan records (about 20:00). Sync the payout-change honesty fix into chapter 0. onboard sent you its strings from fa6a8c7. The compliance agent's list:
- `chapters/ch0Join.ts:24` and `ch0Wizard.ts:82`: "Its placeholder officer means no one can change its payout." → "Its placeholder officer means the company itself can't change its payout."
- `content/onboard.ts:108`: "…so no one can change its payout." → "…so the company itself can't change its payout."
- `content/onboard.ts:109`: → "Any payout change the company asks for needs one of these same people."
- `content/onboard.ts:119–120`: copy register/flow/copy.ts (:43, :45) word for word ("It changes only through a 72-hour public window: … or a governance ruling on a dispute").
- Update `docs/demo-storyboard.md:57, 59`, which quote those captions, in the same commit.
Check the frames still fit at 1440 and 390, and the video kit's narration if it quotes any of these. Commit by path, and tell me so I can redeploy.

### Sat 21:16 JST: Small copy: "verified human" in the World ID for Agents chapter

A small consistency fix for the demo player, from claims2's re-audit and the judge review. The World ID for Agents approvals ran on World's sandbox, where World's own docs call the identities fake, so the site no longer says "verified human" for that flow. webapp changed /agent, /business and /try in 0e3976e, and the button there now reads "Ask a human to approve with World ID".
- **Change:** in chapter 4 and the agent-console parts of the player (ch4Human.ts, AgentPanel.tsx, UrgentCards.tsx), reword "verified human" to match. For example "a human approves with World ID", and use that button label if the player shows it.
- **Keep:** chapter 0's officer wording (OnboardFinish.tsx) can stay. Officers enroll with production World ID (Orb or Selfie Check), where "verified human" is accurate.
- **Process:** typecheck, commit by path, send me the hash. I'll run the full check and deploy.

### Sat 21:20 JST: Dry-run: two small player fixes (ch5 hold, paused chip pictures)

Two small player fixes from the browser dry run. Both are optional polish, but worth it if they're quick and safe. Batch them with your "verified human" wording change.
1. **The chapter 5 hold is too short.** The last refusal ("Refused before signing · screening flagged 0x098B…2f96: known_scam") is fully visible for only about 1.4 s (player 2:17.6–2:19.4) before the fade to the end card. Lengthen that hold by about 2 s: the `+ 1.6` in DURATION in apps/web/src/features/demo/chapters/ch5Agents.ts. It shifts the end card by about 2 s, so tell me the new timing, because the video kit cues depend on it.
2. **Paused chips show the previous beat's end state.** When paused, clicking chips 2, 4 or 5 shows the previous beat's final picture under the new chapter's caption. For example, chip 4 shows the bank-change draft and PayeeMismatch stamp under the 至急 caption. It doesn't affect a play-through, but judges clicking chips will see it. If a clean fix is small, show the new chapter's opening frame when paused.

Typecheck, commit by path, and send me the hash. Don't risk breaking the play-through: if (2) isn't clean, skip it.

### Sat 22:30 JST: FREEZE: recording starting — no apps/web saves

The recording is starting now: no saves under apps/web until I say. :5190 serves the main tree live, and Karan records /demo from it. Thanks for ebe9628; it's deployed.

### Sat 23:41 JST: Freeze lifted; update ch4 to tonight's real 22:17 run (before Karan records)

The freeze is lifted until about 00:30; Karan is asleep. One change before he records Take A: the World judge wants the player's chapter 4 (World ID for Agents) to show tonight's real run, not the earlier one.
- The enrolled approver approved at 22:16:51 JST, with sandbox code RMHB9-MFQB4.
- The payment is tx 0xf7507446d11c2c5cab94ff4b7ca83db36180b3aa8d80085f9556aaeabcea5a03, block 11786455: ¥55,000 from the agent key through the MandateGate, and the vault paid 0x9B4f…47e4.
- Invoice MS-2026-0931.
- The audit entries are in docs/world-agents-approve-run.md.

Update the recorded data or captions that cite the earlier run: its tx and times. Keep "on World's sandbox" wording, and keep chapter timings unchanged if possible; if they shift, tell me the new times for the video kit. Typecheck, check that chips 0–6 show no blank frames, commit by path, and send me the hash.

### Sat 23:52 JST: Ch4: recorded data must come verbatim from the 22:16 run's records

One guardrail on ch4, since I can see urgent-analysis.json, urgent-invoice.ja.txt and chainLog.ts changing. Anything the player presents as the recorded run must come verbatim from the 22:16–22:17 run's own records:
- the agent's stored analysis for MS-2026-0931;
- the audit entries (#77–#85 in data/agent/audit-11155111.jsonl);
- the tx 0xf7507446…5a03 and its receipt.

Don't hand-edit model output or invent fields. If the player needs something the records don't have, e.g. a UI caption, label it as ours, not the model's.

webapp's 4dafa03 also changed OnboardFinish.tsx (chapter 0) to "Resolves on ENS (checked with stock viem)"; don't overwrite it. The ch0Shared.ts comment is yours to fix, optionally.

When you're done: typecheck, check chips 0–6 have no blank frames, commit by path, and send me the hash plus any timing changes. The apps/web freeze starts ~00:30.

### Sun 00:01 JST: Yes to the refused-identity beat (by 00:45); keep the phone mock

d366f44 is excellent: everything traced to the run's own records. Decisions:
1. **Device: keep the phone mock.** It's a neutral "approver's screen", and production World ID for Agents approvals happen in World App on a phone. Just make sure no caption or label claims the sandbox run was approved on a phone.
2. **Yes, add the refused attempt before the approval.** Use GC8TN-9SZCR → wrong_human, nothing paid, from audit #78 and #79, verbatim from the records like the rest.
   - Label it "a different World ID identity is refused", never "a different human".
   - +6–8 s is fine. I'm re-timing the voiceover to the cut anyway, so shifted cues don't matter; just send me the new chapter and caption times.
   - Keep the rest of ch4 as is.
   - **Deadline: committed by 00:45, with no apps/web edits after that.** Karan records on :5190 from ~00:50, and a mid-take HMR reload would ruin a take. If it's not done and verified by 00:45, stop, don't commit a half-state, and tell me. We'll ship ch4 as it is in d366f44.

The same checks as before: typecheck, chips 0–6 with no blank frames at 1440 and 390, the scrub sweep, and the loop wrap.

### Sun 00:07 JST: Re-sending decisions: keep phone mock; YES refused-identity beat, commit by 00:45

8eca9ac is good, and RMHB9-MFQB4 stays: it's in the run's write-up (37da608). Re-sending my decisions in case they crossed:
1. **Keep the phone mock** as a neutral approver's screen. Production approvals happen in World App on a phone. No label may claim the sandbox run was approved on a phone.
2. **Yes, add the refused attempt before the approval:** GC8TN-9SZCR → wrong_human, nothing paid, from audit #78 and #79 verbatim, labelled "a different World ID identity is refused". +6–8 s is fine; send me the new chapter and caption times.
   - **Commit by 00:45, with no apps/web edits after that** (Karan records on :5190).
   - If it isn't done and verified by 00:45, stop and ship 8eca9ac as it is.

### Sun 04:29 JST: URGENT (Karan recording): cherry blossom petals stop moving after a while — find cause, don't touch main tree

Urgent. Karan is recording on :5190 right now and just reported that "the cherry blossom stops moving after a while". It's most likely the petals or sakura in the /demo player's scene; possibly the start page.

**Investigate read-only, fast, ~10 min.** Use a spare port or a worktree, and **don't edit the main tree's apps/web**: Karan's dev server hot-reloads.
- Reproduce: /demo playing from chip 1, and also /demo?paused then Space. Take screenshots every ~10 s for 2–3 min and see whether the petals freeze and when.
- Candidate causes:
  - a finite petal lifetime or pool that isn't recycled;
  - rAF stopping when the stage loses focus or visibility, or on the pointer-hover pause over the agent panel;
  - reduced motion;
  - the paused state freezing the whole world, which would be by design;
  - the loop wrap or a chapter change resetting the emitter;
  - GPU throttling while screen recording.
- Report: the cause, with file:line; whether it affects Karan's S1 take (player chapter 1, ~18 s from chip 1) and S8 (the end card); and the smallest fix.

**Don't land a fix yet.** I decide when, because of hot reload. If it's the "by design" pause, say exactly what Karan should do differently.

### Sun 04:30 JST: Stand down: found it — by-design low-power render on app pages

Stand down, found it: it's on /agent, not the player, and it's by design. SceneLayer.tsx passes `lowPower={!hero}`, so app pages use frameloop 'demand': DemandPump plus the WakeKeeper wake window, then rendering sleeps about 3 s after the camera settles. No change tonight. Thanks.

### Sun 04:34 JST: Land fix A now (DemoPage.tsx only) — Karan is on /register for S4, then re-records S1/S8

Great diagnosis. Land **fix A now**, and only DemoPage.tsx:
- Karan is about to record S4 on /register and /change, which don't import the demo feature, so hot reload won't touch his take.
- Keep it exactly as you wrote it: a mood('calm') wake every 4 s while /demo is mounted, cleared on unmount, and still in demand mode.
- Typecheck, then commit by path.
- Verify on your spare port that the /demo background keeps drawing for 60 s+ and that fps holds at 1440.
- Send me the hash.

Karan re-records S1 and S8 after S6, with a fresh reload of /demo. Leave SceneLayer and /agent alone, and make no other apps/web edits.

### Sun 04:34 JST: Crossed again — ignore the stand-down: LAND fix A now (DemoPage.tsx only)

Our messages crossed. My latest decision, which replaces the stand-down: **land fix A now**, in DemoPage.tsx only. It's the keep-awake mood('calm') every 4 s while /demo is mounted, cleared on unmount, and still in demand mode.
- Karan is recording S4 on /register and /change, which don't import the demo feature, so hot reload won't touch his take.
- Typecheck, commit by path, and verify on your spare port that the background keeps drawing for 60 s+ at ~60 fps.
- Send me the hash.

He re-records S1 and S8 after S6.
