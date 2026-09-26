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
- **The staging simulator can't complete a 4.0 session.** `simulator.worldcoin.org` fetches our request from
  the bridge (200 OK) and then sits on a loading screen; it never offers a fake identity to confirm. A request
  older than a few minutes shows "Invalid or expired QR code" instead. The simulator's own banner says it "will
  change with the adoption of World ID 4.0" — so as of this build, session-based 4.0 flows can't be tested
  end-to-end without a real phone running World App.
- **`rp_context` field naming drifts from the signing helper.** The helper that signs our request context
  outputs a field the verify step expects under a different name (`signature` vs. `sig`); we normalize both on
  read (`RpContextWire` accepts either) rather than betting on one name staying stable.
- **The WASM loader needs a fetch shim under Node.** IDKit's verifier-side WASM module assumes a browser-style
  `fetch` for `file:` URLs; our server needed a small shim before proof verification would even load.
- **PENDING:** team-lead's brief for this file mentions an `integrity_verification_failed` probe as something to
  include. I couldn't find it anywhere in the repo (code, logs, or docs) and don't have direct experience with
  it myself, so I'm not writing a cause for it without evidence. Whoever hit it: send me the context (what
  request produced it, what fixed it) and I'll fold it in accurately.

**Missing docs:** nothing explains that on-chain verification of World ID **4.0** proofs (`WorldIDVerifier.sol` /
`WorldIDSatellite`) is only deployed on **World Chain and Arc** today — the contracts-3.0 legacy page (which
lists Ethereum, Sepolia, Base, Optimism, Polygon) reads as if it still applies to 4.0 proofs, and it doesn't. We
confirmed this directly against World's own docs (`docs.world.org/world-id/idkit/onchain-verification`,
`.../world-id/4-0-migration`) rather than take a secondhand claim on faith. On any chain without a deployed
verifier — Sepolia included — a 4.0 proof has to be checked off-chain, through the Developer Portal's
`POST /api/v4/verify/{rp_id}`, which is exactly what our verifier does.

**Top improvement:** a 4.0-capable web simulator for session flows. Right now, testing a session request end to
end requires a real phone with World App, every time.

**Why Selfie Check, not Orb, in production:** the trust moment IDKit protects here is "is this the same unique
human who enrolled as an officer for this specific company?" — a 1:1 re-authentication of an identity we already
established, not a 1:N uniqueness check across a large population. Orb-level `proof_of_human` is the strongest
available credential for the latter (resisting large-scale Sybil attacks), but it requires physically visiting an
Orb, which doesn't fit officers who need to approve a change from wherever they are. Selfie Check gives the same
"same human, still alive, still them" guarantee this specific re-authentication needs, at a credential strength
proportionate to the attack we're defending against (a stolen business key or a phished inbox, not a fabricated
population of fake humans). The verifier enforces whichever credential a deployment is configured for
(`WORLD_OFFICER_CREDENTIALS`) on every proof, so a weaker one can never slip in underneath it. Passport or other
government-ID data would add personal data collection without closing any additional gap in this threat model.

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
