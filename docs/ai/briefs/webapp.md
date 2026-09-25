# webapp: Build the Meigi main web app

Agent type `oh-my-claudecode:designer`, started Sat 03:26 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

Build `apps/web`: the Meigi main app, reached from the landing page's "enter". This is ETHGlobal Tokyo 2026 on the From Scratch track: write everything now; public libraries are fine and nothing may be copied from other projects. Repo: <workspace>/meigi.

Read first:
- docs/spec.md and contracts/README.md (who can change what)
- docs/landing-spec.md, and the landing's code in apps/landing/src (its design tokens, fonts and components). Reuse that visual language: pastel dawn palette, Inter Tight + Shippori Mincho, a vermilion hanko accent, frosted panels. The app must be calm, legible and fast; no heavy 3D (a subtle static Fuji motif at most).
- services/verifier/src/routes/*.ts (the verifier API) and packages/abi (typed ABIs). packages/x402-guard is also there if useful.

Stack: Vite + React 19 + TypeScript strict + react-router, viem ~2.56.8, @worldcoin/idkit ^4.3 (World ID 4.0 React widgets), @meigi/abi (workspace:*). Wallet: injected EIP-1193 (window.ethereum; Brave Wallet or MetaMask) via viem createWalletClient(custom(window.ethereum)) on Sepolia. No wagmi needed unless it's simpler.

Live facts:
- Chain: Sepolia 11155111.
- Registry 0xB2D61a2d1EF2C340F8b4cf9ec90E1eDCB08a6e84, deployed at block 11780968.
- Resolver 0xEC8C23682Df12A0422d8a656F80c51858E6fEd92, parent payee.eth.
- AgentVault 0x20554C36fe044d4725Fd1C9798fDA69e9a49f74D. Token (MockJPYC "mJPYC") 0xEcA2B093682a46B14b143474d188A120bA2d0EC2.
- One fixture payee: T2011001234567 = 株式会社メイギ商事 (fictional) → payout 0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4.
- Env: VITE_VERIFIER_URL (default http://localhost:8787), VITE_AGENT_URL (default http://localhost:8788), VITE_MERCHANT_URL (default http://localhost:8790), VITE_RPC_URL, VITE_REGISTRY_ADDRESS, VITE_REGISTRY_FROM_BLOCK, VITE_VAULT_ADDRESS, VITE_TOKEN_ADDRESS, VITE_WORLD_APP_ID=app_30048059325fb60b495b43dd2fe67ae0, VITE_WORLD_ENVIRONMENT=staging. Add apps/web/.env.example.

Pages:
1. **/registry, the explorer.**
   - Search a T-number (validate /^T?\d{13}$/). Show the payee card: NTA name, status (active / disputed / unregistered), active payout, threshold and officer count.
   - Show a prominent "payout change pending, lands in HH:MM:SS" banner when `pending` is set, and never display the pending address itself; the same for a controller rotation.
   - Show the ENS name `t<digits>.payee.eth`.
   - Show a live event feed from getLogs (PayoutChangeRequested / Cancelled / Changed, ControllerRotation*, ClaimDisputed, DisputeResolved), querying from VITE_REGISTRY_FROM_BLOCK in chunks, since public RPCs cap log ranges.
2. **/register, the business wizard** (verifier API):
   - (a) T-number + name → POST /registrations. Show the NTA match, or the exact "registered name" on mismatch.
   - (b) Connect the wallet (the controller), sign `domainProof.message` with personal_sign, then show the TXT record (`_meigi.<domain>` value `meigi-sig=<sig>`), the .well-known JSON, and a "check" button → POST /registrations/:id/domain.
   - (c) Officers: a World ID *session* per officer via IDKitSessionWidget (no existing_session_id), preset proofOfHuman({ signal: enrollmentSignal }) where enrollmentSignal comes from step (a), and rp_context from GET /world/rp-context. Send the unchanged result to POST /registrations/:id/officers.
   - (d) Pick a threshold → POST /registrations/:id/submit → show the tx hash with a Sepolia Etherscan link, and "registered" or "disputed".
3. **/change, company changes:**
   - The controller opens an intent: POST /intents with { tNumber, action: PayoutChange | ControllerRotation | CancelPayoutChange | CancelRotation, newAddress? }.
   - The response has sessions [{officerId, sessionId}], signal and rpContext. Each officer proves their saved session with IDKitSessionWidget (existing_session_id = sessionId, preset proofOfHuman({signal})) → POST /intents/:id/approve.
   - Handle { status: pending | approved | executed }.
   - For PayoutChange "approved", the controller's wallet calls registry.requestPayoutChange(tNumber, newAddress, approval), with approval = { officerIds, deadline, signature }.
   - Render errors kindly, especially 403 `not_an_officer` ("Denied: this is not the same human who enrolled").
4. **/agent, the AP console:** the "please try to rob it" screen. This is the demo centrepiece; make it big and readable on a projector.
   - A large textarea for an invoice, plus buttons that load example invoices (fetch the list from the agent API if it has one; otherwise embed 3 short ones: routine, bank-change scam, prompt injection).
   - "Analyze" → POST {VITE_AGENT_URL}/invoices/analyze {text}. Show in columns:
     - extraction (T-number, amount, address)
     - System-1 triage with confidence bars
     - the kernel verdict with reasons
     - screening
     - the LLM agent's proposal (quoted, labelled "the agent believes")
   - "Pay" and "Let the agent pay anyway" → POST /invoices/:id/pay { force }.
   - Render a revert as a big moment: "The chain refused. T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xBE…".
   - The agent API is being built in parallel (services/agent). Code against that contract and handle "unavailable" states gracefully.
5. **/x402**: placeholder panel for the x402 merchant demo (being built separately). Leave a clean slot with two buttons, "buy from honest merchant" and "buy from compromised merchant", calling VITE_MERCHANT_URL/demo/honest and /demo/compromised, which return JSON { verdict, payment? }.

Also:
- Nav with the 名義 mark; the landing's "enter" targets this app's `/`, which should land on /agent or a small home that links to the 4 flows.
- Accessibility: focus rings, labels, reduced motion.
- No console.log, files under 400 lines, functions under 50, feature folders (src/features/{registry,register,change,agent,x402}, src/lib/{chain,api,env}, src/ui).

Verification (required):
- `pnpm install` from the repo root, filtered to @meigi/web... Retry if another agent holds the lockfile.
- `pnpm --filter @meigi/web build` with zero TS errors.
- Headless Playwright screenshots of every page at 1440×900 into docs/web/.
- The registry page must show the live fixture payee T2011001234567 from Sepolia.
- Review your own screenshots and iterate at least once.
- Don't use the user's browser. No git commits.

Report back: the file list, how to run, the screenshots, and what's stubbed pending the agent/merchant APIs.

## Follow-up instructions

### Sat 03:32 JST: x402 demo endpoints are live

The x402 demo service is live locally at http://localhost:8790 (VITE_MERCHANT_URL). CORS allows localhost:5173 and 4173.

- `GET /demo/honest` → `{ verdict: { ok: true, tNumber: "T2010401000001", legalName: "株式会社フジデータ", payTo }, paid: true, data: { pair, rate, asOf }, settlement: { success, transaction: "0x…", network: "eip155:11155111", payer } }`. This is a real Sepolia settlement, so link the tx on sepolia.etherscan.io. It takes about 10–20 s; show progress.
- `GET /demo/compromised` → `{ verdict: { ok: false, code: "payto_mismatch", reason: "payTo 0xdCa5…6d5b is not 株式会社フジデータ (T2010401000001)'s registered payout 0x0C1d…578D", screening? }, paid: false, error }`. Returns in about 1 s. Render it as the refusal moment: "Refused before signing", plus the reason.

`verdict.screening` ({ flagged, summary }) appears once the Intercepta key exists; show it when present.

Each honest call spends real testnet gas, so don't loop it in screenshot runs; one call is enough.

### Sat 03:33 JST: IDKit sessions: use constraints, not presets

IDKit gotcha, verified live with @worldcoin/idkit-core 4.3.0: session flows REJECT presets ("Presets are not supported for session flows. Use .constraints() instead."). This contradicts World's docs example.

- For createSession and proveSession, use `CredentialRequest("proof_of_human", { signal })` as the constraint (core: `.constraints(CredentialRequest(...))`), not `preset={proofOfHuman(...)}`. Check how the React IDKitSessionWidget takes constraints and use that prop.
- rp_context must be `{ rp_id, nonce, created_at, expires_at, signature }`. Our verifier's GET /world/rp-context returns `{ sig, nonce, created_at, expires_at }`, so map `sig` → `signature` and add `rp_id: "rp_d14a7db12e6bfc65"`. I'll add rp_id to the verifier response shortly; handle both shapes.
- environment: "staging" (the World ID simulator at simulator.worldcoin.org).

### Sat 03:41 JST: Verifier is live on :8787 against Sepolia

The verifier is running locally at http://localhost:8787 against live Sepolia and the real NTA index.
- `GET /world/rp-context` now returns the exact IDKit shape `{ rp_id, nonce, created_at, expires_at, signature }`; pass it straight as rp_context.
- `GET /payees/T2011001234567` → `{ tNumber, status: "active", legalName: "株式会社メイギ商事", payout, changePending, rotationPending, threshold }`.
- `GET /nta/T1010601051968` → Curvegrid Inc.'s NTA record (name "Ｃｕｒｖｅｇｒｉｄ株式会社", full-width letters).
- `POST /registrations` with a non-exact name returns 422 `{ code: "nta_name_mismatch", registered: "<official name>" }`. Show "Did you mean <registered>?" with a one-click fill.

For World ID in the browser: the staging simulator rejects World ID 4.0 requests ("Invalid QR code"); 4.0 needs the World ID Sandbox app or the production World App. Make the environment configurable (VITE_WORLD_ENVIRONMENT: staging | sandbox | production) and show the connector QR/link. Don't block on it; the flows must render and handle "waiting for World App" and error states.

### Sat 03:51 JST: Contracts v2: new addresses for apps/web

The contracts were redeployed (v2); v1 is retired. Update apps/web env (and .env.example):
- VITE_REGISTRY_ADDRESS=0x205c977cF1f4Ed42e51a48759550eF40160A6396
- VITE_REGISTRY_FROM_BLOCK=11781105
- VITE_VAULT_ADDRESS=0x87A798CD92dE1340B1b761dd45196AC82bEF793B
- Resolver: 0xe3Fa4DC8C2920CC0a682781d8a51E4bbCaF025dA
- VITE_TOKEN_ADDRESS is unchanged (0xEcA2…0EC2).

The fixtures are the same (T2011001234567 株式会社メイギ商事 → 0x9B4f…47e4; T2010401000001 株式会社フジデータ → 0x0C1d…578D). The verifier (:8787) and x402 demo (:8790) are restarted on v2.

rp_id: GET /world/rp-context now returns the full IDKit shape (rp_id, nonce, created_at, expires_at, signature); your fallback mapping can stay. Your constraints approach for sessions is right.

ABI: packages/abi is regenerated. isInvoicePaid is removed (use invoicePaidAmount), and approveVendor takes (t, expectedPayout, capPerPayment, capPerPeriod) if you show vault admin anywhere.

### Sat 04:01 JST: allowBuilds fixed; pnpm install exits 0

Fixed in the shared config: `allowBuilds: esbuild: true` (committed). `pnpm install` now exits 0, and `pnpm --filter @meigi/web build` should run without the verify-deps workaround. Good progress on the 5 pages. Also, payee.eth is now registered on the ENSv2 Beta and hackathon deployments, so the registry page's ENS line can say "resolves in any ENS client (default viem)".

### Sat 05:09 JST: Status check + next task: hosted build under /app/

Hi! I see uncommitted apps/web changes (World ID session QR, agent console, x402 honest shot, redaction). Two things.

1. **Status.** What are you working on, and roughly when will it be done? When you finish, send a short report: what changed, build/typecheck/axe results, and which screenshots you re-shot. Don't commit; I'll review and commit.
   - Note on `.env.example`: HEAD says the contract addresses default to `contracts/deployments/11155111.json`, and your working copy hard-codes them again. Keep them unset (defaults from the deployment file) unless you have a reason.

2. **Next task, after the current one: a hosted build for the public demo link** (ENS requires a live demo). We'll deploy static files to Cloudflare Pages with the landing page at `/` and this app at `/app/`.
   - **Base path.** Make the app work under a configurable base path (`VITE_BASE`, default `/`). Set Vite's `base` and the router's `basename`. Deep links like `/app/registry` must work; I'll add a `_redirects` rewrite to `/app/index.html`.
   - **Hosted mode** (`VITE_HOSTED=1`). The verifier, agent and x402 services only run on our demo laptop, so on the public site:
     - The registry explorer, ENS check and event feed stay fully live; they only need the public RPC.
     - Pages that need a service (register, change, agent console, x402) show a calm, clear panel instead of error states. Something like: "This step runs on the Meigi demo machine (verifier / AP agent / x402 merchant). Watch it in the demo video, or run it locally: `pnpm --filter @meigi/<svc> start`."
     - Where you have a real result, show it as a static recorded example with Sepolia tx links, e.g. the rob-it revert and the x402 honest settlement tx `0xf3c298960b9abac5466f4aa6e59f9a9ba4b73de703df3468d72f18049077b0df`. Label it clearly as a recorded run, never as live.
     - Keep the World ID widget usable if the verifier URL is reachable. In hosted mode with no verifier, show the panel.
   - **Checks.** No secrets in the bundle (every VITE_ value is public anyway). `pnpm --filter @meigi/web build` with `VITE_BASE=/app/ VITE_HOSTED=1` must pass, and `vite preview` of that build must serve deep links, given a `_redirects`-equivalent.

Keep to the house rules (files <400 lines, functions ≤50 lines, no console.log).

### Sat 05:12 JST: Simplify: no base path needed, separate Pages project

Simplification: skip the `VITE_BASE` / basename work. The app gets its own Cloudflare Pages project, served at the root of its own host (e.g. meigi-app.pages.dev), so the plain `/` base stays. Only hosted mode (`VITE_HOSTED=1`) is still needed, as described before, with `VITE_LANDING_URL` pointing at the landing host.

### Sat 05:21 JST: x402 page: two new unverified-merchant demos (Intercepta)

Heads-up for the x402 page, after your current work. The x402 demo service (:8790, restarted and committed in baf6b04) has two new endpoints. They exist so Intercepta alone decides the outcome, which the Intercepta prize requires.

- `GET /demo/unverified`: a merchant that declares **no** Meigi payee, with a clean `payTo`. The buyer pays small amounts (≤ 50 mJPYC) only after a live Intercepta screen clears `payTo`. Verdict: `{ ok: true, unverified: true, payTo, screening: { flagged: false, summary: "toxicScore 0" } }`, then a real Sepolia settlement. It spends testnet gas, so use it once, not in loops.
- `GET /demo/unverified-flagged`: an undeclared merchant whose `payTo` is the OFAC-listed Ronin exploiter. Verdict: `{ ok: false, code: "screened", reason: "screening flagged 0x098B…2F96: toxicScore …: <traits>", screening }`.
- **Until the Intercepta key lands**, both return `{ ok: false, code: "no_declaration", reason: "merchant declares no Meigi payee and no screening is configured" }`. Screening errors return `code: "screening_unavailable"`.
- New refusal codes to label: `screened`, `screening_unavailable`, `unverified_over_limit`.

Suggested UI: a second row on /x402, "Merchants with no Meigi record", with two cards: "Unverified merchant" and "Unverified merchant, flagged address".
- Show the Intercepta summary (score and traits) prominently. This is the Intercepta moment.
- An `ok: true` with `unverified: true` should read "Paid: unverified merchant, small amount, Intercepta screen clean", not "verified company".
- In hosted mode, the recorded examples can wait until we have real Intercepta results.
