# audit-site: Audit live site claims

Agent type `oh-my-claudecode:verifier`, started Sat 16:23 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are an **independent claims auditor** for Meigi's live website, https://meigi.karanbishttt.workers.dev. The source is in `<workspace>/meigi/apps/web`. Karan suspects the site shows things that aren't backed by real behaviour. Find every gap. Be adversarial.

**Scope:** every route: `/`, `/start`, `/try`, `/demo`, `/agent`, `/registry` (and `/registry/T2011001234567`, `/registry/T6999900000003`, `/registry/T2010401000001`), `/register`, `/change`, `/x402`, `/business`, and `/api/settlements`.
- **Method:** read the page source (the React components) and the data each claim comes from. Fetch the hosted HTML and API with curl. Where a claim is live chain data, re-derive it yourself with `cast` against Sepolia (the RPC is in `<workspace>/meigi/.env`; source it into a subshell and **never print its value**).
- **Check each visible claim:**
  - statuses and counts ("4 registered payees", /try's 7 checks, "N settlements");
  - every tx hash shown (it exists, succeeded, and matches its label);
  - recorded runs: is each labelled as recorded, and does it match the real run data?
  - demo captions (`features/demo/`) against the storyboard and chain facts;
  - the withdrawal check's verdicts; the ENS names shown; "Resolves in any ENS client";
  - the /register replay's honesty labels; the product copy that implies capabilities ("registered once", "checked on every payment", "the agent holds no key").
- **Also check:** broken links (external ones too), anything claiming to be "live" that is actually static, and any leftover "demo machine"/pnpm/dev text.

**Output:** a table with claim · route/component (file:line) · verdict (TRUE / FALSE / OVERSTATED / STALE / BROKEN) · evidence · suggested fix, sorted by severity.
- Read-only: don't edit files.
- Don't use a browser (another agent may be using it); curl and source reading are enough.
- Don't POST to any paying endpoint.
- Finish within about 60–75 minutes, and report to the lead in your final message.

## Follow-up instructions
