# onboard: Build the company onboarding wizard

Agent type `oh-my-claudecode:designer`, started Sat 12:49 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You're joining the Meigi team at ETHGlobal Tokyo 2026 (today is 2026-09-26; submission Sun 09:00 JST, feature freeze about 18:00 today). Meigi is "Confirmation of Payee for stablecoins and AI agents":
- A company's official registry number (a Japanese T-number, 13 digits) is bound on-chain to ONE payout address.
- Registering needs: an exact name match against the National Tax Agency registry (5.79M corporations, indexed locally), a DNS TXT domain proof signed by the company's business key, and World ID officers (IDKit 4.0 sessions).
- The company then resolves in any ENS client as `t<digits>.payee.eth`.
- Changing the payout later needs the business key plus the same verified humans, then 72 hours in public.

Repo: <workspace>/meigi (pnpm monorepo). The web app is apps/web (React 19, Vite, react-router, viem, @worldcoin/idkit). The verifier service is services/verifier, running on :8787 with fictional demo fixtures enabled: any T-number in registry office 9999 with a valid check digit, e.g. T7999900000002, registers without an NTA record or domain proof and is marked fictional on-chain.

**YOUR JOB:** turn the existing registration flow (`apps/web/src/features/register/`, about 860 lines: RegisterPage, CompanyStep, DomainStep, OfficersStep, SubmitStep, useRegistrationFlow, …) into a polished, product-grade **company onboarding wizard**. The founder, Karan, wants "a nice onboarding form" where a company joins Meigi, gets its own wallet, and gets added to the registry. **Keep all existing verifier API calls and security behaviour** (read useRegistrationFlow and services/verifier/src/routes/registrations.ts first); this is a UX rebuild plus a few additions, not new trust logic.

**Wizard (one glass window, a progress rail, one question per screen, smooth step transitions):**
1. **"Your company":** enter a T-number (or paste an LEI; the verifier has `GET /lei/:lei`, which links Japanese LEIs to T-numbers).
   - Live lookup against the NTA index (`useNtaPreview`) auto-fills the registered legal name and address.
   - A fictional office-9999 number shows a clear "fictional demo company" note and asks for a name.
   - Show the ENS name the company will get (`t<digits>.payee.eth`), live as they type.
2. **"Your wallets":**
   - **The business key (controller):** connect a wallet. There's an existing ControllerField/wallet connection; reuse it.
   - **The payout address:** three choices:
     - use the connected wallet;
     - paste another address;
     - **create a new payout wallet**: generate a key in the browser with viem `generatePrivateKey`, show the address, and force a one-time "Download backup" (a JSON file) before continuing. The key never leaves the browser and is never stored or logged. Label it "testnet demo wallet".
3. **"Prove your domain":** the DNS TXT record to add, with a copy button and a "Check now" action (existing DomainStep logic). Fixtures skip it with a note.
4. **"Your officers":** World ID enrollment via the existing OfficersStep/IDKit session logic. Explain in one line why: "Every future payout change needs one of these same people." Keep the credential note component.
5. **"Review and register":** a summary card (name, T-number, ENS name, payout, officers, threshold), then submit, which is the existing on-chain registration by the attester.
6. **"You're verified":** a success screen with a **payee card**: the company name, T-number, `t….payee.eth`, the payout address and a QR of the ENS name. Add a live "✓ resolves in any ENS client" check using stock viem `getEnsAddress` on Sepolia (the app already does this in `lib/chain/registry.ts`). Buttons: "View in the registry" and "Share payee card".

**Design rules** (Karan is strict: read /Users/kryptos/.claude/projects/-Users-kryptos-Desktop-Projects-ethtokyo/memory/meigi-design-rules.md):
- see-through Apple-style glass;
- no white strokes, coloured card edges or gradient banners;
- controls 36/44/52, radii 10/16/24/pill;
- solid ink primary buttons;
- product copy, not hackathon copy.

Use the existing glass classes and tokens from `apps/web/src/ui/`. Another agent owns ui/ and is building a new sidebar app shell right now, so **don't edit ui/**; ask the lead if you need something there. Mobile at 390 must work (one column).

**Ownership:** you own `apps/web/src/features/register/` from now on. Don't edit other features/ folders, ui/, packages/, services/ or contracts/.

**Code rules:**
- files ≤ 400 lines, functions < 50, no console.log;
- handle errors explicitly;
- TypeScript strict, and `pnpm --filter @meigi/web typecheck` must pass.

**Testing:**
- Run a dev server on a spare port (NOT 5173 or 5190).
- Walk the wizard with the fixture T7999900000002 up to the World ID step (don't complete a real registration: that number is reserved for a live demo).
- Check that the NTA auto-fill works for a real company, e.g. T5010401067252 (Sony), in the lookup preview only.
- Screenshot every step at 1440 and 390 into <scratchpad>/onboard/.

**Commits:** commit in steps with Conventional Commits, `git add` by path only (never -A; others have work in progress). End each message with:
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HAsqcAGquPFh83q8WqHVcu

Message the lead ("team-lead") at two checkpoints: first steps 1–2 working (~45 min), then the full wizard (~90 min), each with screenshot paths and a 3-line status. Never print secrets from .env.

## Follow-up instructions

### Sat 13:23 JST: Add the 'representative signature' production step (honest)

One addition from our compliance review: judges will ask "how do you know the registrant really is the company?" Today we have an exact NTA name match, a DNS proof and World ID officers, which proves control of *a* domain, not authority to act for the company. The production answer in Japan is a signature with the **商業登記電子証明書** (the Legal Affairs Bureau's corporate e-certificate for the registered representative; APTCP method ホ; remote signing via gBizID). The fallback is a mail-back code to the NTA-listed head office.

Add it honestly to the wizard, between "Prove your domain" and "Your officers": a step "Prove you represent the company". Offer two options: "Sign with 商業登記電子証明書" and "Mail a code to the registered head office". Both are clearly marked as coming in production (disabled, with a one-line explanation), with "Demo companies skip this step" for fixtures. Don't fake a signature. Use a short, factual note, e.g. "In production, registration needs the registered representative's corporate e-certificate. This demo proves domain control and World ID officers only." Keep the design rules. Commit and include it in your checkpoint-2 screenshots.

### Sat 13:49 JST: Great wizard — 2 follow-ups: representative step + 'registered' wording

Checkpoint 2 looks great: the payee card with the QR, the live ENS check, and the backup-before-continue key handling are all right. Two follow-ups:
1. **The "Prove you represent the company" step is missing** (my earlier message may have arrived late). Add it between "Prove your domain" and "Your officers". Offer two options, "Sign with 商業登記電子証明書 (the Legal Affairs Bureau's corporate e-certificate)" and "Mail a code to the registered head office". Both are clearly marked "Coming in production" (disabled, with one-line explanations). Fixtures show "Demo companies skip this step", plus one factual note: "Today, registration proves an exact NTA name match, domain control and World ID officers. In production it also proves the signer represents the company." Never fake a signature. The rail becomes 7 steps.
2. **Wording, per our compliance review (docs/trust-and-compliance.md):** don't claim the company is "verified". Change the card label "Verified payee" to "Registered payee", and the headline "You're verified." to "You're registered.", keeping the sentence below it. In the rail, "You're verified" becomes "Registered". Check that no other screen says "verified company". "2 verified humans" for World ID officers is fine: that part really is verified.

On your notes: (a) leave pending_public_window for now; the window stays at 0h. (b) I'll get the world-live.sh steps updated. Commit by path and send the new crops for the representative step and the payee card.

### Sat 13:58 JST: I fixed the submit timeout (f2c987b); please fix reviewer #1–#6

Your reviewer's re-check is in (it sent you the list too). I've fixed the part outside your folder: f2c987b gives `submitRegistration` a 120 s timeout, since the verifier answers only after the Sepolia transaction is mined. Please handle the rest in features/register, then commit by path:
- **#1 (the priority):** `already_submitted` must never lead to "Start over". Show "This registration was already submitted" with a "View in the registry" link to `/registry/${tNumber}`.
- **#2:** paste mode refuses the unsaved new wallet's address.
- **#3:** only fall back to a download when the save dialog can't open. On a write error, keep the key and show an error.
- **#5:** label the LEI and NTA-address rows as lookup details, not what's written on-chain.
- **#6:** split `useNewPayoutWallet` under 50 lines.
- **#4** (pick the file back to verify) is optional; skip it if time is short.

These go together with the two follow-ups already in your queue: the representative step, and the "registered" wording.

### Sat 14:00 JST: Map the verifier's new error codes to friendly wizard messages

One more item for your queue (after the reviewer fixes, the representative step and the wording). The verifier now returns new errors (all `{code, message}`). Show each as a clear, calm message on the relevant step:
- 409 `officer_limit`: "This World ID is already an officer of 3 companies."
- 409 `duplicate_open_registration`: "You already have an open registration for this number." Offer to continue it or view it.
- 409 `too_many_officers`: the maximum is 8.
- 409 `already_disputed`: "This number is already disputed; payments to it are frozen until governance resolves it."
- 410 `registration_expired`: "This draft expired after 24 hours." Start over is appropriate here.
- 429 `rate_limited`: honour Retry-After with "Try again in N minutes".
- `already_submitted` can now also come from /domain and /officers. Treat it like #1: show "View in the registry", never "Start over".

`pending_public_window` (HTTP 202) stays out of scope while the window is 0h. Commit by path.

### Sat 14:41 JST: Hosted /register must show the real wizard (replay), not the pnpm box

New priority from Karan. Finish your current edit, commit by path, then take this.

**Problem.** On the hosted site, /register can't reach the verifier. ServiceGate falls back to `RegisterHosted`: a DemoMachine box saying "This step runs on the Meigi demo machine… run it locally: `pnpm --filter @meigi/verifier start`". Karan watched /demo, whose chapter 0 shows a lovely /register wizard, then opened the real /register and got that box. His words: "what it shows is not what is in our register page… it has like download using npm and all… should it not be the same thing?" Yes, it should.

**Build.** A hosted /register that *is* the wizard, as a replay of a real registration:
- The same ProgressRail and the same step screens as the live wizard (reuse the real step components in a read-only mode, or render them from recorded state; your call).
- Filled from a real registration: for now the demo company 株式会社メイギ商事 T2011001234567 (seed tx `0x277c2115…d2dc`, the same data as demo ch0: business wallet `0xc33a…4638`, payout `0x9B4f…47e4`). Its steps are labelled honestly, as the real wizard labels fixture companies ("Fictional demo company", domain skipped, placeholder officer).
- Next/Back to step through, plus autoplay that pauses on interaction. It ends on your real Registered step: the payee card with the live "Resolves in any ENS client" check, since that's a real chain read.
- One honest line at the top: "Replay of a registration on Sepolia · registering your own company opens with the beta". The CTA is "Talk to us" (mailto:karanbishttt@gmail.com). **No pnpm/npm commands and no "demo machine" wording anywhere.**
- Keep `ServiceGate`: live wizard when the verifier is reachable (localhost and the booth), replay otherwise.

Later, worldui records a real production World ID registration (T7999900000002, real phone). Make the recording a data file (`features/register/replay/recording.ts` or similar) so it can be swapped in with no UI change. Tell worldui the shape.

Coordinate with **demo**: its ch0 replica should show your final 7 steps, so tell it your step names and labels once they're stable.

Follow the design rules (no strokes or coloured edges, see-through glass). Verify at 1440/1024/390 and run `pnpm --filter @meigi/web typecheck`. Commit by path.

### Sat 14:49 JST: Order: /register replay first, then reviewer #1

Order of work, since you now have the reviewer's list (978a7de/e7cc148: 1 medium, 4 low) and my /register brief:
1. Commit what you have in flight.
2. **The hosted /register replay.** This is what Karan sees.
3. Reviewer #1 (medium: resume drops the current registration; swap instead). Real companies only, but fix it.
4. #5, the two overstated messages: say "This draft expired.", and give the demo company's representative line its own honest wording. Quick.
5. #2, #3 and #4 if time allows.
Commit each separately, by path.

### Sat 15:05 JST: Replay honesty fix now; true replay after the World ID run

The reviewer's medium on the replay is right. Decision:

**Now (interim, before the next deploy):** make the replay honest about what it is.
- Change the bar to something like: "How the wizard presents a registration · the demo company 株式会社メイギ商事 was registered on Sepolia by our seed script" (your wording; keep it short and plain).
- Drop what never happened: "Connected" on the business key (show the controller address as the registered business key instead) and the "Paste an address" choice (show the payout as registered).
- #2: for a placeholder-officer company, give the last screen a variant line that doesn't claim officers can change it. For example: "Its placeholder officer means no one can change this payout; real companies change it with their business key, their officers and 72 hours in public." Also address the viewer ("It's registered."), not "You're registered."
- #6: pause when focus enters the replay window, and scroll the new screen's title into view on Back/Next.

**Later (true replay):** worldui's real production World ID run registers T7999900000002 (office 9999) through the live wizard with a real officer. When its recording lands, swap it in as the default replay via recording.ts. That's a genuine replay, and the bar can then say "Replay of a real registration".

**T2011001234567 stays** (too entangled to renumber now). Keep saying "Not in the NTA registry", never "provably fictional".

Then #3–#5 from the earlier list if time allows. Commit each by path, and tell me when the interim fix is in; it gates the deploy.

### Sat 15:36 JST: Heads-up: git history rewritten; all hashes changed

Heads-up: at 15:33 I rewrote the repo's history, with Karan's go-ahead, to drop three internal prep docs from every commit, and force-pushed main. **Every commit hash changed.** Trees are identical, and your working tree is untouched. main = origin/main = 12f8e40. Get current hashes from `git log`, and find old work by subject with `git log --oneline --grep`. Don't gc or prune.

### Sat 16:45 JST: Honesty fix in register copy: payout-change wording (audit HIGH)

An independent audit found our payout-change claim too strong. Besides the business key plus officers, **governance can change a payout by ruling on a dispute**, and that also waits 72 h in public (PayeeRegistry `resolveDispute` → `finalizeDispute`). Please fix every register-flow string that says a change needs "your business key, your officers and 72 hours": flow/copy.ts, the registered screen and ledes, and the replay's placeholder variant. Honest short version, e.g.: "It changes only through a 72-hour public window: your business key with your officers, or a governance ruling on a dispute." Keep it one sentence and product voice, and fit the layouts at 390. Also sweep for "retired" (the contract has only Active and Disputed) and "1 open claim" wording. Commit by path, and tell demo if ch0's copy mirrors any of it.

### Sat 17:40 JST: Git hygiene: commit only by path

Git hygiene, and no action on 54a95d9 itself; I'm leaving history as is. Your commit 54a95d9 also contains worldui's World ID decline-path files: Approvals.tsx, rpContext.ts, WorldIdProof.tsx, WorldIdSession.tsx, OfficersStep.tsx and docs/world-live-run.md. They were staged in the shared index when you committed. The content is fine and typechecks. From now on, commit only with `git commit -m "…" -- <your paths>`, which ignores whatever else is staged, and never run a bare `git commit`.

### Sat 22:30 JST: FREEZE: recording starting — no apps/web saves

The recording is starting now: no saves under apps/web, especially features/register, until I say. Karan records the live registration on localhost:5190, which serves the main tree.
