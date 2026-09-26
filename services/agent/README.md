# @meigi/agent: the accounts-payable agent

An AI agent reads supplier documents (Japanese qualified invoices, e-mails, x402 `402` responses) and pays them from an
on-chain `AgentVault` with its own key (`AGENT_PRIVATE_KEY`). The vault only pays approved vendors, by T-number, to
their registered payout, so a fooled agent still can't send money anywhere else.

Every document goes through these layers. Only the kernel, and then the vault itself, can move money.

| Layer | What it does | Code |
|---|---|---|
| Extraction | Regexes and arithmetic over the **visible** text: T-number, address, amount (¥/円/JPYC, 全角 via NFKC, 万/千), invoice number, due date. Ambiguity, hidden content, markup (any tag beyond bare formatting, comments, CDATA…), bidirectional controls, credit notes and missing billing wording are blocking flags. | `src/extract/` |
| System-1 triage | Four typed questions (request type, new destination, pressure, suspicion) routed by `p_safe`. | `src/triage/` |
| Agent proposal (System 2) | A deliberately gullible LLM proposes a payment. It is shown in the console and never executed as-is. | `src/llm/` |
| Kernel | Re-checks everything `payInvoice` checks against one chain snapshot. Every reason names the registered company. | `src/kernel/` |
| Screening | Intercepta (Web3 Antivirus) quick-scan of the addresses involved. | `src/screening/` |
| Human approval | A hold that is a judgement call (pressure, System-1's hold, the auto-clear budget) can be released by a verified human who proves with World App, freshly, for this one payment (World ID for Agents). | `src/approval/` |
| Payment | Always simulates first; a simulated revert is decoded into a sentence and never broadcast. | `src/chain/payer.ts`, `src/analysis/pay.ts` |

## Endpoints

The server listens on `http://127.0.0.1:8788`. POSTs must send `content-type: application/json`, and a bearer token too
if `AGENT_API_TOKEN` is set. It answers only requests addressed to `localhost`, `127.0.0.1` or `[::1]` (or a name in
`AGENT_ALLOWED_HOSTS`); any other Host gets `403 forbidden_host`, so a DNS-rebinding page can't drive it.

| Method | Path | Returns |
|---|---|---|
| POST | `/invoices/analyze` `{ text }` (≤ 60,000 chars) | `{ id, createdAt, extracted, triage, proposal, kernel, screening, verdict, explanation, timings, approval }`. The analysis is kept in memory by `id`. `approval` is `{ enabled, approvable }`: whether human approval is configured, and whether a person could release this hold (computed even when it is off). |
| GET | `/invoices/:id` | The stored analysis, with a live `approval` |
| POST | `/invoices/:id/pay` `{ force?: boolean }` or `{ approvalId }` | See the payment results below |
| POST | `/invoices/:id/approval` `{}` | `202 { attemptId, userCode, verificationUriComplete, expiresAt, interval }` (unix seconds; seconds): see [Human approval](#human-approval-world-id-for-agents) |
| GET | `/invoices/:id/approval` | `{ attemptId, status, expiresAt, used, approvedAt?, approver?, reason? }` |
| GET | `/vault` | `{ agent, vaultAgent, agentAuthorized, vault, registry, owner, token, balance, paused, vendorDelaySeconds, vendors[] }` |
| GET | `/demo/invoices` | The documents in `scripts/demo-invoices/` with the manifest |
| GET | `/health` | `{ ok, chainId, vault, agent, triage, triageRequired, llm, screening, humanApproval }` |

A payment returns one of:

- `{ status: "paid", txHash, blockNumber, payTo, amount, invoiceRef, forced }`
- `{ status: "pending", txHash }`: sent, receipt not seen yet. POST `{}` again to settle it; it is never resent (an
  approval pays once, so don't send the `approvalId` again).
- `{ status: "reverted", broadcast, txHash?, error: { name, args, sentence }, explanation }`
- `{ status: "held", reasons, explanation }`

The invoice reference is `invoiceRef = keccak256("T<13 digits>|<INVOICE NUMBER>")`, with the number width-folded and
upper-cased.

## Pay, hold and force

- **Pay:** only when the verdict is `pay`. That needs every kernel check passing, an unambiguous visible document,
  System-1 auto-clearing it, and no screened address flagged.
- **Force** (`{ force: true }`) is simulate-only: it shows the chain's answer to a held payment and never sends a
  transaction. A revert is decoded (e.g. *"T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked
  for 0xdCa5…6d5b."*) and returned as `reverted` with `broadcast: false`.
- **Judgement holds:** System-1 pressure above `TRIAGE_MAX_PRESSURE` (0.5) or urgency wording in the document
  (`pressure_hold`), and amounts above `AUTO_CLEAR_MAX_YEN` when it is set (`above_auto_clear_budget`), hold a
  payment that would otherwise clear. A verified human may release these (below).
- **Force never pays.** When the simulation passes, nothing is sent and the result is `held`:
  - `force_needs_human` ("Forcing can't pay; only a verified human can release this hold") when a verified human
    could approve the holds, whether or not World ID is configured;
  - otherwise `force_refused`.
  So force can never stand in for the human approval below.
- **What force doesn't even simulate** (`force_refused`): credit notes, hidden content, markup, bidirectional
  controls, ambiguous or conflicting totals, missing invoice numbers or T-numbers, several addresses, and screening
  hits.
- **Where values come from:** the T-number and amount always come from the document. Only the destination may come
  from the agent's proposal, and the vault rejects any address that isn't the registered one.
- **Explanations:** the explaining LLM sees kernel facts only, never document text. Document quotes travel in
  `evidence` for the console.

## Human approval (World ID for Agents)

A held payment whose holds are all judgement calls can be released by a verified human, freshly, for that one
payment. It uses the World ID for Agents OIDC provider (`https://sandbox.auth.world.org`) with the RFC 8628 device
grant: the agent is the device, and the human approves in World App. It is off unless `WORLD_AGENTS_CLIENT_ID` and
`WORLD_AGENTS_CLIENT_SECRET` are both set; then every approval route answers `503 approval_not_configured`.

- **Approvable holds:** `triage_hold`, `triage_unavailable`, `pressure_hold`, `above_auto_clear_budget` and
  `screening_unavailable` (a configured screen that couldn't answer). Anything
  else on the invoice (a credit note, hidden content, markup, ambiguous totals, a missing number, several addresses, a
  screening hit, or a payee/vendor/cap reason the chain would refuse) makes `POST …/approval` answer
  `409 not_approvable`, and so does an invoice that isn't held or is already paid.
- **Flow:**
  1. `POST /invoices/:id/approval {}` answers `202 { attemptId, userCode, verificationUriComplete, expiresAt,
     interval }`. Show `verificationUriComplete` as a QR code, with the user code and a countdown to `expiresAt`.
     While an attempt is pending, POST again returns the same attempt. The device code never leaves the server. At
     most 8 attempts poll at once (`429 approval_busy` beyond that), and an invoice gets at most one new attempt per
     `interval` (`429 approval_too_soon`).
  2. The agent polls the IdP's token endpoint in the background. It honours `interval`, adds 5 s per `slow_down`,
     backs off on 5xx or network errors (three in a row stop it as `unavailable`), and stops at `expires_in`
     (20 minutes at most).
  3. Poll `GET /invoices/:id/approval` (every 2 to 3 s is fine; it only reads memory). It returns
     `{ attemptId, status, expiresAt, used, approvedAt?, approver?, reason? }`. The times are unix seconds.
  4. When `status` is `approved`, `POST /invoices/:id/pay { approvalId: attemptId }` within 10 minutes. It runs the
     normal pay path: simulation first, and the vault re-checks vendor, caps and payee.
- **Statuses:**
  - `pending`: waiting for the human.
  - `approved`: `approvedAt` is the proof's `auth_time`. `approver` is `enrolled` (just enrolled, during an
    enrolment run) or `matched`.
  - `denied`: declined in World App, or the ID token was invalid (`reason` says which).
  - `expired`: nobody approved in time, or an approval went unused for 10 minutes.
  - `unavailable`: the IdP couldn't be reached. This is never an approval.
  - `wrong_human`: someone other than the approver on file proved.
- **The ID token must have:** RS256 via the IdP's JWKS; the exact `iss`; `aud` equal to the client id and nothing
  else; `exp`, `iat`, `sub` and `auth_time` present; an unexpired `exp`; `acr = https://world.org/oidc/acr/orb-v3`;
  and `auth_time` no earlier than the attempt's start − 30 s and no later than now + 30 s. The approver is the
  pairwise `sub`.
- **Discovery is pinned:** the device, token and key-set endpoints must be on the issuer's own origin, and no IdP
  request follows a redirect. A key set that can't be fetched or read makes the attempt `unavailable`.
- **Approvers:** the `sub` values in `WORLD_AGENTS_APPROVERS` (matched exactly), plus the one enrolled in
  `WORLD_AGENTS_APPROVERS_PATH` (`data/agent/approvers.json`, resolved from `services/agent`, git-ignored, mode 600).
  Anyone else is `wrong_human`. Nobody is ever enrolled unless `WORLD_AGENTS_ENROLL=1`, so a stranger who scans a
  projected QR code first can't become the approver.
- **Enrolment run** (once, in private, before the demo):
  1. Start the agent with `WORLD_AGENTS_ENROLL=1` and `WORLD_AGENTS_APPROVERS` empty.
  2. Analyze `07-urgent-invoice.ja.txt`, ask for approval, and approve it in World App with the approver's own
     World ID. The status says `approver: "enrolled"`, and the `sub` is saved. Don't pay it if you want to keep 07
     for the demo.
  3. Restart without `WORLD_AGENTS_ENROLL`. From then on only that person is `matched`. Enrolment also closes after
     the first enrolment, and an unreadable approver file fails closed.
  4. To start over, delete the approver file and repeat. `WORLD_AGENTS_ENROLL` is ignored while
     `WORLD_AGENTS_APPROVERS` is set.
- **Binding and single use:** an attempt is bound, server-side, to the invoice id, T-number, payout, amount, invoice
  reference and hold reasons it was started for. The device grant can't carry a nonce or binding message.
- **Rehearsed against the real sandbox (2026-09-26, anvil):** the dev agent used the real client
  (`client_secret_basic`), with `WORLD_AGENTS_ENROLL=1` and `WORLD_AGENTS_TRACE=1` for that run only and a separate
  approver file under the git-ignored `data/agent/`.
  - **Device authorization:** the user code has 11 characters (`ABCDE-FGHJK`), `verification_uri_complete` is
    `https://sandbox.auth.world.org/authorize?transaction_id=…`, `expires_in` is 1200 and `interval` is 5. The
    sandbox proves with a fake identity in the browser ("Authenticate with World ID", then "Approve sign-in" or "Deny
    sign-in"), so no phone is needed. The page may first show an older pending transaction from the same browser, so
    match the user code on screen.
  - **ID token:** RS256 with a `kid`; `iss` is the issuer; `aud` is the client id (a string); `acr` is
    `https://world.org/oidc/acr/orb-v3`; `amr` is `["pop"]`; `sub` is 52 characters in the base64url alphabet;
    `exp − iat` is 300 s. The claims are `acr amr aud auth_time exp iat iss jti sub`, with no `nonce`. `auth_time`
    came 42 s after the attempt started. It passed validation unchanged.
  - **Approve run:** status `approved` (approver `enrolled`), then `pay { approvalId }` paid ¥55,000 to Meigi Shoji's
    registered payout on anvil. A second pay with the same approval got `409 approval_used`.
  - **Deny run:** "Deny sign-in" made the token endpoint answer `access_denied`, and no ID token was issued. The
    status read `denied` ("the person declined in World App"), pay got `409 approval_not_approved`, and the agent's
    nonce didn't move.
- **Rehearsing against a new IdP:** `WORLD_AGENTS_TRACE=1` writes one stderr line per ID token: its algorithm,
  whether `iss` and `aud` match, `acr`, `amr`, the `sub`'s length and alphabet, `auth_time` relative to the attempt,
  the lifetime and the claim names. It never writes the `sub` or the token. Leave it off otherwise.
- **Local rehearsal without World App:** `pnpm --filter @meigi/agent mock:idp` runs a mock IdP on
  `http://127.0.0.1:8791`. Its `verificationUriComplete` page has Approve, Approve as someone else (`wrong_human`),
  Deny and Expire buttons. Start an agent with `WORLD_AGENTS_ISSUER=http://127.0.0.1:8791`,
  `WORLD_AGENTS_CLIENT_ID=mock-client`, `WORLD_AGENTS_CLIENT_SECRET=mock-secret` and
  `WORLD_AGENTS_APPROVERS=mock-human-approver`, preferably on anvil (`dev:local`).
  The issuer must be https except on loopback. With a mock issuer the agent warns at startup that approvals prove
  nothing.
- **Pay errors, where nothing is paid:**
  - `404 approval_not_found`: no such attempt for this invoice.
  - `409 approval_not_approved`: the attempt is pending, denied, expired, unavailable or wrong_human.
  - `409 approval_used`: an approval pays at most once, even when the chain refused it.
  - `409 approval_void`: the analysis changed after approval.
  - `400`: `force` and `approvalId` were sent together.

## Run it

Run these from the repo root.

```sh
pnpm install --filter "@meigi/agent..."
pnpm --filter @meigi/agent start          # reads meigi/.env (Sepolia)
```

For a local chain, use three terminals:

```sh
pnpm --filter @meigi/agent local:chain    # anvil :8547, forge Deploy.s.sol, demo vendors, writes .env.local
pnpm --filter @meigi/agent dev:local      # .env overlaid with .env.local
pnpm --filter @meigi/agent demo --force   # analyses (and forces) every demo document; force only simulates
```

Tests:

```sh
pnpm --filter @meigi/agent test               # unit tests, fakes only
pnpm --filter @meigi/agent test:integration   # real contracts on anvil via forge (needs forge + anvil)
pnpm --filter @meigi/agent typecheck
```

The integration test deploys with `forge script contracts/script/Deploy.s.sol` from a temporary Foundry root with a
minimal environment. Forge auto-loads `.env` from its working directory and parents, and the repo's `.env` holds the
Sepolia `TOKEN_ADDRESS`, which the deploy script would otherwise reuse.

## Configuration

All settings come from the environment; see `.env.example`. The required ones are `SEPOLIA_RPC_URL`,
`AGENT_PRIVATE_KEY`, `REGISTRY_ADDRESS` and `VAULT_ADDRESS`. At startup the agent checks that the vault's registry
and token match the configuration, that the key is the vault's agent, and that it is not the owner.

| Area | Default |
|---|---|
| Triage | `TRIAGE_BACKENDS=systemone,proxy`, `SYSTEMONE_URL=http://127.0.0.1:8102/v1/systemone`, `TRIAGE_MIN_P_SAFE=0.9`, `TRIAGE_REQUIRED=true` |
| LLM | `LLM_PROVIDER=local` (the default for demos: a model on this machine behind an OpenAI-compatible API, `LOCAL_LLM_URL=http://127.0.0.1:11434/v1`, `LOCAL_LLM_MODEL=llama3.1:8b`, `LOCAL_LLM_TIMEOUT_MS=60000`), `proxy` (Llama 3.3 via `AI_PROXY_URL/v1/chat` with `AI_PROXY_TOKEN`), `anthropic` (`ANTHROPIC_API_KEY`, `claude-haiku-4-5`), `workers-ai` or `none` |
| Screening | `INTERCEPTA_API_KEY` (optional), `INTERCEPTA_CACHE_PATH=../../data/agent/intercepta-cache.json`, `INTERCEPTA_MAX_CALLS=900`, `INTERCEPTA_TOXIC_THRESHOLD=50` |
| Judgement holds | `TRIAGE_MAX_PRESSURE=0.5`, `AUTO_CLEAR_MAX_YEN` (unset: no budget hold) |
| Human approval | `WORLD_AGENTS_CLIENT_ID` and `WORLD_AGENTS_CLIENT_SECRET` (both or neither), `WORLD_AGENTS_ISSUER=https://sandbox.auth.world.org`, `WORLD_AGENTS_AUTH_METHOD=client_secret_basic` (or `client_secret_post`), `WORLD_AGENTS_APPROVERS`, `WORLD_AGENTS_ENROLL` (off), `WORLD_AGENTS_APPROVERS_PATH=../../data/agent/approvers.json`, `WORLD_AGENTS_TRACE` (off) |
| Server | `AGENT_PORT=8788`, `AGENT_HOST=127.0.0.1`, `AGENT_ALLOWED_HOSTS` (extra Host names for LAN use), `APP_ORIGINS=http://localhost:5173,http://localhost:4173`, `VENDOR_T_NUMBERS=2011001234567` |

### Local LLM (the default for demos)

The gullible proposal and the hold explanation run on a local model by default, because Workers AI's free daily
quota runs out. Install [Ollama](https://ollama.com), then run `ollama pull llama3.1:8b`; Ollama serves an
OpenAI-compatible API at `http://127.0.0.1:11434/v1`.

- The agent posts to `${LOCAL_LLM_URL}/chat/completions`, asking for `response_format: { type: "json_object" }` for
  the proposal. A reply with a JSON object inside prose is accepted too.
- No key is needed. `LOCAL_LLM_URL` must be https, or http on loopback only.
- Thinking is switched off (`reasoning_effort: "none"`). A thinking model such as `gemma4:e4b` otherwise spends
  the whole token budget reasoning and returns empty content. Ollama ignores the setting for other models.
- The first call loads the model into memory and is slower. `LOCAL_LLM_TIMEOUT_MS` (60 s) bounds every call.
- If the server isn't running, the proposal shows as unavailable and the explanation falls back to a template.
  Nothing else changes, because the model never decides a payment.

### Triage backend

The default System-1 model is the team's fine-tuned **payee-0.8b**, served by `kev.serve` at
`http://127.0.0.1:8102/v1/systemone`. It uses the same `/v1/systemone` contract as Jev (see `bench/`). If it doesn't
answer, the agent tries Jev through the team's Cloudflare proxy (`AI_PROXY_URL/v1/systemone`), which returns 402
until credits exist. If no backend answers, the analysis says "triage unavailable" and every invoice holds; set
`TRIAGE_REQUIRED=false` to make that a warning instead.

The question strings match `bench/payeebench/schema.py` byte for byte, because the fine-tune binds them;
`test/questions.test.ts` checks this against the PayeeBench dataset. The state has the same shape as PayeeBench's,
with `payee_on_file` read from the registry. Routing uses PayeeBench's rule:

```
p_safe = P(routine_invoice or credit_note) × P(no new destination) × P(suspicion ≤ 1)
```

A document auto-clears when `p_safe ≥ TRIAGE_MIN_P_SAFE`. PayeeBench's thresholds for payee-0.8b at a 1% error
budget are 0.880 (deployed) and 0.903 (oracle). A System-1 `credit_note` answer always blocks payment.

### Where Intercepta is called

- **Client:** `src/screening/intercepta.ts` calls
  `GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan` with header `X-API-KEY`.
- **Caller:** `src/analysis/analyze.ts` screens the document's printed addresses (up to 3), the agent's proposed
  `payTo`, and always the registered payout the vault pays, even when the document prints no address.
- **Caching and budget:** results are cached per address in memory and in `INTERCEPTA_CACHE_PATH`
  (`src/screening/cache.ts`). A clean result is re-checked after 10 minutes; a flagged one is kept. Every call
  counts against `INTERCEPTA_MAX_CALLS`.
- **Flagging:** an address is flagged at `toxicScore ≥ 50`, or when it has a severe trait (`known_scammer`,
  `sanction_address`, `fake_phishing_transfer`, `mixer_transfers`, …). A flagged address blocks payment, and force
  can't override it.
- **With a key:** an address that couldn't be screened (an outage, a timeout, a 5xx, a spent call budget) holds the
  payment as `screening_unavailable`. A verified human may approve that hold, because nothing says the payee is
  bad.
- **Without a key:** the result is "screening not configured" (`screening_not_configured`, a warning), never mock
  data. The demo works without a key.

## Demo documents

`scripts/demo-invoices/` holds seven documents. `vendors.json` lists the fictional vendors and the expected outcomes.

| File | Expected |
|---|---|
| `01-routine-invoice.ja.txt` | Pays: registered payout, within caps, adds up |
| `02-bank-change-bec.ja.txt` | Holds; force shows the `PayeeMismatch` revert and names 株式会社メイギ商事 |
| `03-fake-ceo-urgent.en.txt` | Holds; force shows the `VendorNotApproved` revert |
| `04-prompt-injection.ja.txt` | Holds as tampering (hidden address); force refused |
| `05-credit-note.ja.txt` | Holds; never paid |
| `06-x402-swapped-payto.json` | Holds; force shows the `PayeeMismatch` revert on Sepolia |
| `07-urgent-invoice.ja.txt` | Genuine but urgent (至急): holds for `pressure_hold`. A verified human approves it, then it pays; a denial or expiry pays nothing, and force answers `force_needs_human`. |

Every T-number has a valid 法人番号 check digit and is absent from the nationwide NTA index (5,787,472 corporations).
Bayside's number, T3999905000001, uses registry office 9999, which doesn't exist.
