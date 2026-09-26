# dryrun: Browser dry run of every video take

Agent type `general-purpose`, started Sat 20:36 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are the dry-run tester for Meigi (名義), an ETHGlobal Tokyo 2026 project. It's Confirmation of Payee for stablecoins and AI agents. Karan is about to record the demo video, silently: screen only, voiceover added later. Before that, rehearse every take in a real headless browser and find anything broken, slow, ugly or confusing, so we fix it before he records. Tomorrow's live judging demo uses the same paths.

## Environment
- Repo: `<workspace>/meigi`. It's READ-ONLY for you: don't edit or commit anything. The main tree is frozen for the recording.
- Scratch space: `<scratchpad>/dryrun/`. Put your scripts and screenshots here.
- Playwright: import it from `<workspace>/meigi/apps/web/node_modules/playwright/index.mjs`. Chromium is installed; other agents used it tonight. Use a 1920×1080 viewport (recording resolution) for every take, plus 390×844 spot checks.
- Hosted site: https://meigi.karanbishttt.workers.dev
- Local rehearsal web: http://localhost:5190. Use `localhost`, not 127.0.0.1: it listens on IPv6 only. It serves the local stack.
- Live services:
  - verifier :8787
  - AP agent :8788
  - signer :8796
  - x402 demo :8790
- Read `<workspace>/knowledge/07-video-kit.md`, the take list, and `meigi/docs/runbook.md` (the "Demo checks" section) first.

## Hard safety rules (the stack is live on Sepolia)
- NEVER press **Pay** on any invoice, and never call the agent's /pay. A forced pay (`{force:true}`) on invoice 02 is allowed: it's simulate-only by code.
- NEVER press **Request approval** or start a World ID for Agents approval.
- NEVER complete a World ID proof, and NEVER press **Register** in the registration wizard.
  - You may walk /register up to the officers step, to see the QR and the "Confirm in World ID…" state, then press our own **Cancel** and check the message.
  - Create at most 2 draft registrations; they're off-chain and expire.
  - Use T7999900000002 only, with the name 株式会社ソラノ精機.
- Don't restart, signal or reconfigure any service. Only GETs and the analysis POSTs the UI itself makes.
- Don't run `scripts/ap-stack.sh` with any flag.
- No secrets: never print `.env` values.

## Takes to rehearse, in recording order
- **A:** `/demo` on the hosted site, from chip 1 (the email) through to the end card.
  - Screenshot every chapter.
  - Time each chapter.
  - Check the Full-screen button and captions-off.
  - Specifically test the known bug "pause, then jump to another chapter → blank stage", and also a jump by chip without pausing.
- **W:** `http://localhost:5190/register`, T7999900000002, name 株式会社ソラノ精機, up to step 5 (officers).
  - Screenshot each step.
  - Note anything confusing on screen.
  - At step 5: does the QR render? Do "Open in World ID", "Copy link" and "Cancel" work? What does Cancel show?
  - Stop there.
  - Also load `/registry/T7999900000002`. It's unregistered right now; is that shown sensibly?
- **D:** the local agent console. Find where the web app on localhost:5190 shows the AP agent.
  - Load the demo invoices and run Analyze on **07** (the 至急 one).
  - Check it holds, shows as approvable, and how the approval button looks.
  - DON'T press Request approval.
  - Also run Analyze on 02, and a forced pay on 02 (simulate only). It must show `PayeeMismatch` naming 株式会社メイギ商事 and nothing broadcast.
  - Record the timings. The first Analyze is slow (model warm-up); note how slow.
- **B:** the hosted `/business` withdrawal check. Run both examples, the bank-change scam address and Meigi Shoji's payout, cold and warm, and time them. Check the verdict text.
- **E:** hosted `/registry/T4999900000005`.
  - The `ap` row must now show "The vault pays only while this name answers. Revoke it and the agent can't pay.", because the ENS MandateGate is live as the vault's agent.
  - Also check `/registry/T2011001234567` shows "Names issued by this company" (ap, keiri, zeirishi).
- **C:** hosted `/demo?paused` → chip 6 (End). The end card should show, paused.
- **Also, the live judging path:**
  - hosted `/try`: "Run it live" on check 3 must show "Refused by the vault on Sepolia at block N";
  - check 4 should read "Pending · World ID phone run";
  - hosted `/agent`: the note, and the live refusal panel;
  - hosted `/x402`, `/`, `/start` and `/registry`. Check the payee count label and each page's console errors;
  - app.ens.dev on `t2011001234567.payee.eth`: does it load and show the profile?

## For every page
- Console errors or warnings.
- Failed network requests. Ignore expected 404s from probes.
- Overflow at 1920×1080 and at 390.
- Slow loads over 3 s.
- Any text that is stale or untrue. Cross-check against `meigi/docs/ens.md`, the README and the chain if unsure. Examples: "booth", "today", a wrong count, or "the vault's agent key", which is a known stale line on hosted /agent that is already fixed and waiting.
- Anything that would look bad on camera: spinners stuck, layout jumps, flashes, tiny text.

## Report (to the lead)
1. A table: take · step · works? · time · screenshot path · issue (severity: blocker / fix-before-recording / cosmetic).
2. The top 10 issues, ranked, each with the exact place (URL and element) and a concrete suggested fix. Name the owning area: web / agent / verifier / docs.
3. What only Karan can check: the World ID phone steps.

Be factual: say what you actually saw, with screenshot paths. Don't claim anything you didn't observe.

## Follow-up instructions
