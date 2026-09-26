# Calls we made

Approved by Karan for publication on 2026-09-27.

Only decisions stated in Karan's own words, or picked via an `AskUserQuestion` answer, are
listed below -- nothing inferred, and nothing decided by an agent on its own. Each entry links
to its full verbatim entry (by anchor) in [`prompts.md`](prompts.md).

This list is curated: it shows product and engineering decisions only. Messages that were
about personal logistics or private preparation are left out, and a few sentences inside
kept messages are redacted.

- **2026-09-25 23:48-23:49 JST** -- Locked in Meigi (payee verification) as the project, over the other candidate ideas. See `p-0925-2348`, `p-0925-2349` in `prompts.md`. “whatever u suggest do the same check u did previously no?”
- **2026-09-26 02:23 JST** -- Commit-discipline instruction: commit as you go, using Conventional Commits. See `p-0926-0223` in `prompts.md`. “commit as you go do conventional commits”
- **2026-09-26 09:02 JST** -- Remove personal names from the public landing page; show only "ETHGlobal Tokyo". See `p-0926-0902` in `prompts.md`. “also remove the names from the top ig in landing page, just having ethglobal tokyo works ig”
- **2026-09-26 09:05 JST** -- Add a "For business" page, and show the demo working for a non-Japanese company via a global LEI lookup. See `p-0926-0905` in `prompts.md`. “Yes, add it (Recommended) / Add LEI lookup (Recommended)”
- **2026-09-26 09:53 JST** -- Build a Selfie Check fallback so the World ID officer demo works even if World doesn't approve TestFlight access in time. See `p-0926-0953` in `prompts.md`. “Yes, build it now (Recommended)”
- **2026-09-26 12:47 JST** -- Add a company-onboarding-wizard idea to the interactive demo. See `p-0926-1247` in `prompts.md`. “we can have a nice onboarding form”
- **2026-09-26 12:49 JST** -- Leaned the project's framing toward Curvegrid's tracks, since Curvegrid seemed Japan-aligned. See `p-0926-1249` in `prompts.md`. “we can have a look on curvegrids prizes and lean our project on companies selling digital assets”
- **2026-09-26 13:53-13:54 JST** -- Funded the on-chain deployer using MIZU mined to Karan's own ENS address (karanbisht.eth); confirmed on-chain as a genuine 0.1 MIZU transfer. See `p-0926-1353`, `p-0926-1354` in `prompts.md`. “also i got 0.2 mizu in my karanbisht.eth address if u require”
- **2026-09-26 14:22, 14:32 JST** -- Dropped Intercepta from the sponsor-prize picks; kept at most three tracks (final pick: ENS + World + Curvegrid, per project memory). See `p-0926-1422`, `p-0926-1432` in `prompts.md`. “we finally got the intercepta key but we have dropped them right?”
- **2026-09-26 14:37 JST** -- The World integration must be a genuine use case, not just a login/verification checkbox. See `p-0926-1437` in `prompts.md`. “our pitch should be clear uh, how we are using the tech that it's not just for login”
- **2026-09-26 14:41 JST** -- Internal planning files (e.g. demo.md, planning.md, knowledge.md) must stay local-only and never be pushed or committed to the remote repo. See `p-0926-1441` in `prompts.md`. “make sure that you have not uh, you know pushed or committed any of the internal planning files like the”
- **2026-09-26 16:22 JST** -- A plain ENS name isn't enough for the ENS prize -- go deeper into ENSv2 capabilities (subnames/permissions/etc.). See `p-0926-1622` in `prompts.md`. “I don't think just giving an ENS name is enough for ENS”
- **2026-09-26 16:19 JST** -- Make sure the project genuinely uses ENS's own technology, not just a superficial name -- flagged because ENS team members were actively checking at the venue. See `p-0926-1619` in `prompts.md`. “make sure we are using their thing”
- **2026-09-26 15:55 JST** -- Chose to complete World ID verification in person at a physical Orb (Selfie Check wasn't working) rather than wait. See `p-0926-1555` in `prompts.md`. “I'll just get myself verified I guess so [redacted: personal] uh, orb”
- **2026-09-26 16:33 JST** -- Approved the Cloudflare Workers paid plan. See `p-0926-1633` in `prompts.md`. “got the workers plan done”
- **2026-09-26 16:46 JST** -- No-billing constraint: do not let the Cloudflare account run up charges. See `p-0926-1646` in `prompts.md`. “bruh also make sure ure not billing the card bro i dont wanna front a massive bill”
- **2026-09-26 09:55-10:29 JST** -- Design-taste correction: reject the flat/white/colored-edge look ("a pure Claude move"). See `p-0926-0955` in `prompts.md`. “coloring on the edge that is like a pure Claude move”
- **2026-09-25 21:53 JST** -- Keep the repo private until just before submission, then make it public. See `p-0926-0653` in `prompts.md`. “keep repo private we'll public before submitting”

## Not in these transcripts

- **The Codex CLI prompt for the garden-scene revision.** It lives in Codex's own history, not in these
  transcripts.
- **Pre-event ideation.** This search started at Fri 25 Sep 21:00 JST (build start) by design,
  so earlier sponsor-strategy or idea-selection framing from before that isn't here.
- **Anything Adithya did or decided.** Only Karan's own typed turns to this lead session were
  in scope here; Adithya's own prompts (to this or any other session) were not searched.
