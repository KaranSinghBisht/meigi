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
if `AGENT_API_TOKEN` is set.

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
- **Force** (`{ force: true }`) attempts a held payment to show the chain's answer. It is simulated first; a revert
  is decoded (e.g. *"T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b."*)
  and nothing is sent.
- **Judgement holds:** System-1 pressure above `TRIAGE_MAX_PRESSURE` (0.5) or urgency wording in the document
  (`pressure_hold`), and amounts above `AUTO_CLEAR_MAX_YEN` when it is set (`above_auto_clear_budget`), hold a
  payment that would otherwise clear. A verified human may release these (below).
- **Force only asks the chain.** It is allowed only when at least one hold is one the vault enforces itself (payout
  mismatch, unregistered or disputed payee, vendor not approved or not yet active, payout changed, caps, already
  paid, balance, paused, not the agent). Judgement holds (triage, pressure, the auto-clear budget, injection wording)
  may ride along, but force never releases them. When every hold is one a verified human could approve, force
  answers `force_needs_human` ("Only a verified human can release this hold; forcing can't"), whether or not World ID
  is configured. A clean forced simulation is sent only when the chain enforced every hold; otherwise nothing is
  sent (`force_needs_human` or `force_refused`).
- **What force never overrides** (`force_refused`): credit notes, hidden content, markup, bidirectional controls,
  ambiguous or conflicting totals, missing invoice numbers or T-numbers, several addresses, and screening hits.
- **Where values come from:** the T-number and amount always come from the document. Only the destination may come
  from the agent's proposal, and the vault rejects any address that isn't the registered one.
- **Explanations:** the explaining LLM sees kernel facts only, never document text. Document quotes travel in
  `evidence` for the console.

## Human approval (World ID for Agents)

A held payment whose holds are all judgement calls can be released by a verified human, freshly, for that one
payment. It uses the World ID for Agents OIDC provider (`https://sandbox.auth.world.org`) with the RFC 8628 device
grant: the agent is the device, and the human approves in World App. It is off unless `WORLD_AGENTS_CLIENT_ID` and
`WORLD_AGENTS_CLIENT_SECRET` are both set; then every approval route answers `503 approval_not_configured`.

- **Approvable holds:** `triage_hold`, `triage_unavailable`, `pressure_hold` and `above_auto_clear_budget`. Anything
  else on the invoice (a credit note, hidden content, markup, ambiguous totals, a missing number, several addresses, a
  screening hit, or a payee/vendor/cap reason the chain would refuse) makes `POST …/approval` answer
  `409 not_approvable`, and so does an invoice that isn't held or is already paid.
- **Flow:**
  1. `POST /invoices/:id/approval {}` answers `202 { attemptId, userCode, verificationUriComplete, expiresAt,
     interval }`. Show `verificationUriComplete` as a QR code, with the user code and a countdown to `expiresAt`.
     While an attempt is pending, POST again returns the same attempt. The device code never leaves the server.
  2. The agent polls the IdP's token endpoint in the background. It honours `interval`, adds 5 s per `slow_down`,
     backs off on 5xx or network errors (three in a row stop it as `unavailable`), and stops at `expires_in`
     (20 minutes at most).
  3. Poll `GET /invoices/:id/approval` (every 2 to 3 s is fine; it only reads memory). It returns
     `{ attemptId, status, expiresAt, used, approvedAt?, approver?, reason? }`. The times are unix seconds.
  4. When `status` is `approved`, `POST /invoices/:id/pay { approvalId: attemptId }` within 10 minutes. It runs the
     normal pay path: simulation first, and the vault re-checks vendor, caps and payee.
- **Statuses:**
  - `pending`: waiting for the human.
  - `approved`: `approvedAt` is the proof's `auth_time`. `approver` is `enrolled` (the first approver, now on file)
    or `matched`.
  - `denied`: declined in World App, or the ID token was invalid (`reason` says which).
  - `expired`: nobody approved in time, or an approval went unused for 10 minutes.
  - `unavailable`: the IdP couldn't be reached. This is never an approval.
  - `wrong_human`: someone other than the approver on file proved.
- **The ID token must have:** RS256 via the IdP's JWKS; the exact `iss`; `aud` equal to the client id and nothing
  else; an unexpired `exp`; `acr = https://world.org/oidc/acr/orb-v3`; and `auth_time` no earlier than the attempt's
  start − 30 s and no later than now + 30 s. The approver is the pairwise `sub`.
- **Approvers:** `WORLD_AGENTS_APPROVERS` lists the allowed `sub` values. When it is empty, the first approved proof
  enrolls its `sub` in `WORLD_AGENTS_APPROVERS_PATH` (`data/agent/approvers.json`, git-ignored, mode 600), and
  anyone else is `wrong_human`. That is trust on first use, so set the list for anything beyond the demo.
- **Binding and single use:** an attempt is bound, server-side, to the invoice id, T-number, payout, amount, invoice
  reference and hold reasons it was started for. The device grant can't carry a nonce or binding message.
- **Local rehearsal without World App:** `pnpm --filter @meigi/agent mock:idp` runs a mock IdP on
  `http://127.0.0.1:8791`. Its `verificationUriComplete` page has Approve, Approve as someone else (`wrong_human`),
  Deny and Expire buttons. Start an agent with `WORLD_AGENTS_ISSUER=http://127.0.0.1:8791`,
  `WORLD_AGENTS_CLIENT_ID=mock-client` and `WORLD_AGENTS_CLIENT_SECRET=mock-secret`, preferably on anvil (`dev:local`).
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
pnpm --filter @meigi/agent demo --force   # analyses (and forces) every demo document; --force belongs on anvil
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
| LLM | `LLM_PROVIDER=proxy` (Llama 3.3 via `AI_PROXY_URL/v1/chat` with `AI_PROXY_TOKEN`), or `anthropic` (`ANTHROPIC_API_KEY`, `claude-haiku-4-5`), `workers-ai` or `none` |
| Screening | `INTERCEPTA_API_KEY` (optional), `INTERCEPTA_CACHE_PATH=../../data/agent/intercepta-cache.json`, `INTERCEPTA_MAX_CALLS=900`, `INTERCEPTA_TOXIC_THRESHOLD=50` |
| Judgement holds | `TRIAGE_MAX_PRESSURE=0.5`, `AUTO_CLEAR_MAX_YEN` (unset: no budget hold) |
| Human approval | `WORLD_AGENTS_CLIENT_ID` and `WORLD_AGENTS_CLIENT_SECRET` (both or neither), `WORLD_AGENTS_ISSUER=https://sandbox.auth.world.org`, `WORLD_AGENTS_AUTH_METHOD=client_secret_basic` (or `client_secret_post`), `WORLD_AGENTS_APPROVERS`, `WORLD_AGENTS_APPROVERS_PATH=../../data/agent/approvers.json` |
| Server | `AGENT_PORT=8788`, `AGENT_HOST=127.0.0.1`, `APP_ORIGINS=http://localhost:5173,http://localhost:4173`, `VENDOR_T_NUMBERS=2011001234567` |

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
- **Caller:** `src/analysis/analyze.ts` screens the document's printed addresses (up to 3), plus the agent's proposed
  `payTo` if the document never printed it.
- **Caching and budget:** results are cached per address in memory and in `INTERCEPTA_CACHE_PATH`
  (`src/screening/cache.ts`), and every call counts against `INTERCEPTA_MAX_CALLS`.
- **Flagging:** an address is flagged at `toxicScore ≥ 50`, or when it has a severe trait (`known_scammer`,
  `sanction_address`, `fake_phishing_transfer`, `mixer_transfers`, …). A flagged address blocks payment, and force
  can't override it.
- **Without a key:** the result is "screening unavailable", never mock data.

## Demo documents

`scripts/demo-invoices/` holds seven documents. `vendors.json` lists the fictional vendors and the expected outcomes.

| File | Expected |
|---|---|
| `01-routine-invoice.ja.txt` | Pays: registered payout, within caps, adds up |
| `02-bank-change-bec.ja.txt` | Holds; force reverts `PayeeMismatch` and names 株式会社メイギ商事 |
| `03-fake-ceo-urgent.en.txt` | Holds; force reverts `VendorNotApproved` |
| `04-prompt-injection.ja.txt` | Holds as tampering (hidden address); force refused |
| `05-credit-note.ja.txt` | Holds; never paid |
| `06-x402-swapped-payto.json` | Holds; force reverts `PayeeMismatch` on Sepolia |
| `07-urgent-invoice.ja.txt` | Genuine but urgent (至急): holds for `pressure_hold`. A verified human approves it, then it pays; a denial or expiry pays nothing. `pnpm demo --force` never forces it. |

Every T-number has a valid 法人番号 check digit and is absent from the nationwide NTA index (5,787,472 corporations).
Bayside's number, T3999905000001, uses registry office 9999, which doesn't exist.
