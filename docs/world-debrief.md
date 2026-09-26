# World integration debrief

Required submission artifact for both World tracks (Best Use of IDKit, Best Use of World ID for Agents). Written
from what actually happened building against the real sandbox and staging endpoints, not from the docs alone.

## Best Use of IDKit (officer sessions, payout-change approvals)

**Time to first success:** about 3 hours from reading the IDKit 4.0 docs to a verified session proof round-
tripping through our verifier — most of it spent on the two friction points below, not on our own code.

**Friction, in the order we hit it:**
- **Session flows reject presets.** IDKit's own example for `createSession` uses a preset, but a session
  request with one is refused: "Presets are not supported for session flows. Use `.constraints()` instead." The
  docs example needed correcting before anything else would work.
- **The staging simulator can't complete a 4.0 session — re-tested same-day as a possible phone-free booth
  backup, ruled out.** We didn't want to assume this had stayed true, so we re-ran it fresh: a brand-new
  `IDKit.createSession(...)` connector URI, straight from the verifier's own `session.ts` (same `WORLD_APP_ID`/
  `WORLD_RP_ID` the live app uses, `environment: "staging"`), pasted into simulator.worldcoin.org's own "Paste
  code" flow. Both attempts fail client-side, immediately, with `Invalid QR code` thrown inside the simulator's
  own `performVerification` — before it makes any network request at all (nothing to `verify` or any World
  endpoint shows in the browser's network log). So this isn't a stale-QR or a hung-bridge issue; the simulator's
  own link parser rejects a session-mode request outright. Its banner is unchanged: "This simulator will change
  with the adoption of World ID 4.0." **Conclusion: no simulator-based, phone-free booth backup exists today.**
  We didn't add a `--staging --simulator` path to `world-live.sh`, since that would document something that
  doesn't work. The only credential paths that work today are a phone running World ID (production) or the
  World ID Sandbox app (staging/sandbox) — and Sandbox is itself still phone-app-based, not a desktop stand-in,
  and this team's own Sandbox access isn't fully unblocked yet (Android invite pending, iOS needs an email-based
  portal account). Session-based 4.0 flows still can't be tested end-to-end without one of those two real apps.
- **`rp_context` field naming drifts from the signing helper.** The helper that signs our request context
  outputs a field the verify step expects under a different name (`signature` vs. `sig`); we normalize both on
  read (`RpContextWire` accepts either) rather than betting on one name staying stable.
- **The WASM loader needs a fetch shim under Node.** IDKit's verifier-side WASM module assumes a browser-style
  `fetch` for `file:` URLs; our server needed a small shim before proof verification would even load.
- **Self Check enrollment failed in-app, twice, for a real officer in Tokyo; Orb used instead.** Scanning our
  enrollment QR (constraint `{any: [{type: "selfie", ...}, {type: "proof_of_human", ...}]}`) walked him into Self
  Check as documented, but the World ID app itself failed both attempts with a generic "Something went wrong.
  There was a temporary issue verifying you." — once at 15:59 JST and again at about 16:05 JST. Our verifier
  never received a request either time — whatever failed happened entirely inside World's own app/backend,
  before a proof was ever produced. He then set out for a physical Orb nearby to complete verification that way
  instead. We checked our side against
  World's own docs rather than assume it was our bug: no documented regional restriction on Self Check (Japan or
  otherwise), no documented app-version or device prerequisite, and no Developer Portal gate for Self Check the
  way "Identity Check" is explicitly gated as preview-only — we found nothing pointing at our configuration. One
  genuine gap we can point to: World's own docs mention the `any()`/`all()`/`enumerate()` constraint builders
  exactly once, only for mutually-exclusive NFC credentials (passport/eID/MNC); we found no documented example of
  `any()` combining Self Check with Proof of Human, so we can't independently confirm this exact shape is a
  well-trodden path on World's side. World's status page also logged one resolved "World ID Verifications"
  incident two days before this (2026-09-24) and a maintenance window three days before that, suggesting the
  underlying service has had some recent instability, though nothing was showing as actively degraded at the
  time. Net: most consistent with a transient failure in World's own Self Check pipeline, not something we could
  reproduce a fix for from our side. We did hone our own handling either way: added the missing calm treatment
  for every real `IDKitErrorCodes` value we weren't covering (about half were unmapped), and a "no answer from
  World ID yet, try again or cancel" state after 2.5 minutes of silence, since World ID failing without
  relaying anything back through the bridge was itself a real gap in our own UX.
- **PENDING:** team-lead's brief for this file mentions an `integrity_verification_failed` probe as something to
  include. I couldn't find it anywhere in the repo (code, logs, or docs) and don't have direct experience with
  it myself, so I'm not writing a cause for it without evidence. Whoever hit it: send me the context (what
  request produced it, what fixed it) and I'll fold it in accurately.

**Production route confirmed live, first-hand.** Sent five deliberately-invalid probes myself, directly to
`POST https://developer.world.org/api/v4/verify/rp_d14a7db12e6bfc65` (our real production RP id, no auth beyond
the URL), each with an obviously-fake `responses[0]` body and nothing that could pass as a real proof. Every one
came back a structured `HTTP 400 {"code":"validation_error","detail":"...","attribute":"..."}` — never a
connection failure, a 5xx, or an unstructured response — confirming the route and RP id are live in production.
Each response revealed one more layer of the real schema (a genuine, if slow, way to learn it): `protocol_version`
must be the string `"4.0"`; `responses[0]` needs `issuer_schema_id` (a **number** matching a known credential type,
not our placeholder `0`), `expires_at_min`, and `proof` as an **array of exactly 5 elements** (ours was a string,
then the wrong-length array). I stopped once I'd confirmed liveness and structured validation rather than keep
guessing a real proof's shape — I did not reach the specific `integrity_verification_failed` code team-lead saw
earlier the same day (their probe was evidently well-formed enough to pass schema validation and fail a deeper
semantic/cryptographic check instead; mine never got past schema validation). Both are genuine, structured
rejections from the same live production endpoint — no real phone proof has passed there yet.

**Missing docs:** nothing explains that on-chain verification of World ID **4.0** proofs (`WorldIDVerifier.sol` /
`WorldIDSatellite`) is only deployed on **World Chain and Arc** today — the contracts-3.0 legacy page (which
lists Ethereum, Sepolia, Base, Optimism, Polygon) reads as if it still applies to 4.0 proofs, and it doesn't. We
confirmed this directly against World's own docs (`docs.world.org/world-id/idkit/onchain-verification`,
`.../world-id/4-0-migration`) rather than take a secondhand claim on faith. On any chain without a deployed
verifier — Sepolia included — a 4.0 proof has to be checked off-chain, through the Developer Portal's
`POST /api/v4/verify/{rp_id}`, which is exactly what our verifier does.

**Top improvement:** a 4.0-capable web simulator for session flows. Right now, testing a session request end to
end requires a real phone with the World ID app, every time.

**The session proves continuity; the credential sets assurance — one story, not two claims.** Earlier copy said
Selfie Check gives "the same unique human" guarantee. That conflated two different things World's own docs keep
separate:
- The **session** (`createSession`/`proveSession`) is what proves "the same human who enrolled," across every
  later approval — that's a continuity property of the session mechanism itself, not of any one credential.
- The **credential** sets how strongly that session's holder is one real, unique person. World documents Selfie
  Check as **medium-assurance** ("does not provide a strict one-person-one-account guarantee") and Orb-based
  Proof of Human as **high-assurance** ("each human can only have one PoH credential").
- Our trust moment is a **1:1 re-authentication** ("is this the same session that enrolled as an officer?"), not
  a **1:N uniqueness** check across a large population. In production (`scripts/world-live.sh --yes`), **the
  minimum we request is Selfie Check** — a 1-of-1 quorum on a Selfie Check session is enough, since the session
  already answers "same human," and we don't need Selfie Check's weaker Sybil-resistance to also carry an
  anti-squatting job it isn't built for. **Orb is accepted too** (`WORLD_OFFICER_CREDENTIALS=selfie,proof_of_human`,
  set by that same production launch script): whichever an officer happens to hold clears the bar, since Selfie
  Check is already the floor there, not a ceiling. That's a production-only addition, not a standing default: the
  verifier's own code default (`services/verifier/src/config.ts`) is narrower, `proof_of_human` only, which is
  what staging and sandbox runs get unless overridden. [PENDING confirmation once his run reaches this step:
  Karan's officer used Orb.]
- An **N-of-M quorum**, where several independent identities must each be genuinely unique humans (not just
  genuinely the same session-holder each time), should require Orb — that's exactly the case Selfie Check's
  weaker Sybil-resistance isn't built for. Gating on Selfie Check's own `sybil_score` (a real field on its
  response, a risk signal rather than a uniqueness verdict) is a softer alternative worth considering there. We
  don't gate on `sybil_score` today.
- **Known limit, roadmap:** our officer-company cap (`officerCompanyLimit`, `services/verifier/src/limits/`) is
  keyed on the session's officer id today, not on a Sybil-resistant uniqueness nullifier for a fixed action —
  someone willing to complete Selfie Check under several distinct sessions could exceed the intended per-human
  cap. Keying it on a uniqueness nullifier instead is the fix; Orb's proof-of-human already provides one, Selfie
  Check's `sybil_score` is a softer signal toward the same goal.

The verifier enforces whichever credential a deployment is configured for (`WORLD_OFFICER_CREDENTIALS`) on every
proof, so a weaker one can never slip in underneath what was configured. Passport or other government-ID data
would add personal data collection without closing any additional gap in this threat model.

## Best Use of World ID for Agents (the AP agent's held payments)

**Time to first success:** about 10 minutes from registering the OAuth client to the first validated ID token —
the fastest of any World integration here, because the device authorization grant needs no session state on our
side beyond the poll.

**What went well:** portal sign-in with Gmail was smooth. The sandbox's in-browser fake identities made every
path (approve, deny, wrong-human) testable without a phone, which the IDKit session flow above notably can't do.

**Friction:**
- The device grant carries no binding message or nonce — the approval screen shows only the requester's name,
  not what's being approved. Our console shows the held invoice's T-number, payout and amount next to the user
  code to make up for it, but that's a workaround, not something World's flow provides.
- A stale pending request in the same browser made a fresh approval link bounce to the old one first; matching
  the user code on our side caught the mismatch, but it cost debugging time before we understood why.

**Validated where it has to be:** server-side, never the client. The backend polls the token endpoint itself and
validates the returned ID token independently (`services/agent/src/approval/`): RS256 against the IdP's JWKS
with every endpoint pinned to the issuer's origin, exact `iss`/`aud`, `acr` = orb-v3, a fresh `auth_time`, and
`exp`/`iat`/`sub`/`auth_time` all required. It then requires the pairwise `sub` to match the one enrolled
approver — enrollment is a separate, private run, so a stranger who scans a QR code can't become the approver by
completing it.

**Top improvement:** the same one CIBA-style flows solve elsewhere — let the device grant carry a binding message
or a transaction hash, so the human approves what's on their screen, not just who's asking.
