# @meigi/agent: the accounts-payable agent

An AI agent reads supplier documents (Japanese qualified invoices, e-mails, x402 `402` responses) and pays them from an
on-chain `AgentVault`. **The agent holds no key.** A separate process, [`services/signer`](../signer), holds the vault's
agent key and signs `AgentVault.payInvoice` for it, and nothing else. The agent refuses to start if the key reaches its
environment. The vault only pays approved vendors, by T-number, to their registered payout, so a fooled agent still
can't send money anywhere else.

Every document goes through these layers. Only the kernel, and then the vault itself, can move money.

| Layer | What it does | Code |
|---|---|---|
| Extraction | Regexes and arithmetic over the **visible** text: T-number, address, amount (¥/円/JPYC, 全角 via NFKC, 万/千), invoice number, due date. Ambiguity, hidden content, markup (any tag beyond bare formatting, comments, CDATA…), bidirectional controls, credit notes and missing billing wording are blocking flags. | `src/extract/` |
| System-1 triage | Four typed questions (request type, new destination, pressure, suspicion) routed by `p_safe`. | `src/triage/` |
| Agent proposal (System 2) | A deliberately gullible LLM proposes a payment. It is shown in the console and never executed as-is. | `src/llm/` |
| Kernel | Re-checks everything `payInvoice` checks against one chain snapshot. Every reason names the registered company. | `src/kernel/` |
| Screening | Intercepta (Web3 Antivirus) quick-scan of the addresses involved. | `src/screening/` |
| Human approval | A hold that is a judgement call (pressure, System-1's hold, the auto-clear budget) can be released by a verified human who proves with World App, freshly, for this one payment (World ID for Agents). | `src/approval/` |
| Payment | Always simulates first; a simulated revert is decoded into a sentence and never broadcast. The signer signs, and applies its own ceiling: above ¥150,000 only with a verified human's approval. | `src/chain/remote-payer.ts`, `src/analysis/pay.ts`, `services/signer` |
| Settlement | What was paid and received, from Curvegrid MultiBaas's event index (RPC logs as the fallback). | `src/multibaas/`, `src/history/`, `src/routes/payments.ts` |

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
| GET | `/payments?tNumber=T…[,T…]&limit=50` | `{ label, source: { settled, received }, notes, settled[], received[], refused[], mizuhiki }`: see [Settlement history](#settlement-history-curvegrid-multibaas) |
| GET | `/invoices/:id/settlement` | `{ status: "confirmed" \| "indexing" \| "pending" \| "mismatch", source, txHash, blockNumber?, at?, note? }`; `404 not_paid` |
| GET | `/vault` | `{ agent, vaultAgent, agentAuthorized, vault, registry, owner, token, balance, paused, vendorDelaySeconds, vendors[] }` |
| GET | `/demo/invoices` | The documents in `scripts/demo-invoices/` with the manifest |
| GET | `/health` | `{ ok, chainId, vault, agent, triage, triageRequired, llm, screening, humanApproval, multibaas, mizuhiki }` |
| GET | `/audit?limit=100&verify=1` | `{ entries[], chain? }`: the newest audit entries, newest first; with `verify`, `chain` is `{ ok, entries, brokenAt?, reason? }`. See [Audit log](#audit-log) |

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
- **Possible duplicates:** the vault refuses a second payment for the same `invoiceRef`. On top of that, the agent
  holds an invoice (`possible_duplicate`, approvable) when it already paid one from the same payee, for the same
  amount, whose number differs only in separators (`MS/2026/0917` after `MS-2026-0917`). The `invoiceRef` hashing
  itself never changes, because already-paid refs could otherwise pay again.
- **Where values come from:** the T-number and amount always come from the document. Only the destination may come
  from the agent's proposal, and the vault rejects any address that isn't the registered one.
- **Explanations:** the explaining LLM sees kernel facts only, never document text. Document quotes travel in
  `evidence` for the console.

## Human approval (World ID for Agents)

A held payment whose holds are all judgement calls can be released by a verified human, freshly, for that one
payment. It uses the World ID for Agents OIDC provider (`https://sandbox.auth.world.org`) with the RFC 8628 device
grant: the agent is the device, and the human approves in World App. It is off unless `WORLD_AGENTS_CLIENT_ID` and
`WORLD_AGENTS_CLIENT_SECRET` are both set; then every approval route answers `503 approval_not_configured`.

- **Approvable holds:** `triage_hold`, `triage_unavailable`, `pressure_hold`, `above_auto_clear_budget`,
  `screening_unavailable` (a configured screen that couldn't answer) and `possible_duplicate`. Anything
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

## Audit log

Every decision and every payment step is recorded in an append-only, hash-chained JSONL file:
`data/agent/audit-<chainId>.jsonl` (git-ignored; `AUDIT_LOG_PATH` overrides it).
- **The chain.** Each line carries `seq`, `at`, `event`, `prev` (the previous line's `hash`; 64 zeros for the
  first) and `hash`, the SHA-256 of the line's canonical JSON (keys sorted) without `hash`. Editing, dropping or
  reordering any past line breaks the chain from there on. `GET /audit?verify=1` names the first line that doesn't
  fit.
- **What is recorded:**
  - `analysis`: the verdict and its reasons, and the document's SHA-256 (never its text or a reason's evidence).
    Also the T-number, invoice number, amount, the payTo and the registered payout, the triage route, the model's
    proposal, flagged screening results, and whether a person could approve it.
  - `approval.started` and `approval.settled`: the World ID for Agents attempt and the analysis it's bound to. On
    approval: `auth_time`, whether the approver was on the allow-list or enrolled, and the first 16 hex of
    SHA-256(sub). Never the sub, a device code or a token.
  - `payment`: the mode (auto, force, approved), the approval id, then `pending` with the tx hash as soon as it's
    sent (so a crash can't lose it), and the outcome: paid with its block, reverted (and whether anything was
    broadcast), or held with the reasons.
  - `signer.simulate` and `signer.pay`: every exchange with the signer. Each records the key the signer named
    (`signerId`), the payInvoice fields (T-number, invoiceRef, payout, amount) and whether a human's approval went
    with it (never the token).
    - `signer.simulate` also records what the signer's simulation returned: the payout, or the revert's name.
    - `signer.pay` records `outcome` (`sent` with the tx hash, `refused` with the signer's reason, `reverted`, or
      `unreachable`/`unanswered`, when it may or may not have signed). It also records `simulation`, the result
      of the signer's own re-simulation inside its send lock (null when it answered with a tx already in flight).
- **Failures.** A verdict that can't be recorded isn't returned. A payment step that can't be recorded is reported
  on stderr, but the payment's result still reaches the caller.
- **One file per agent.** The Sepolia agent and a local-chain agent write different files, because a chain of hashes
  has one writer.

## Settlement history (Curvegrid MultiBaas)

Two MultiBaas deployments, one per chain:
- **Sepolia**, the agent's own chain. MultiBaas indexes from the block the contracts were linked at: a free plan
  backfills about 100 blocks. So `GET /payments` merges two sources: MultiBaas's rows from that block on, and RPC
  logs read with viem for the older history. Every row is tagged with where it came from.
- **Mizuhiki Awaji** (chain 6497). Meigi is indexed and queried only through MultiBaas, like Curvegrid's Matsuri
  sample.

- **Setup:** `pnpm --filter @meigi/agent multibaas:setup --awaji` (the Awaji deployment, `MULTIBAAS_AWAJI_URL` and
  `MULTIBAAS_AWAJI_API_KEY`) or without `--awaji` (`MULTIBAAS_URL` and `MULTIBAAS_API_KEY`). It is idempotent.
  - It reads the chain the deployment serves, and the addresses from `contracts/deployments/<chain>.json`.
  - It imports each contract's ABI through MultiBaas's explorer lookup, or uses the repo's copy when the lookup has no
    ABI declaring the events it queries.
  - It aliases and links PayeeRegistry, AgentVault, PayRouter and the JPY token. Event indexing starts at the first
    block of the forge broadcast that deployed them (Sepolia: block 11781105). `--from-block N` overrides the start,
    and a negative N counts back from the head: Sepolia is linked with `--from-block -100`. A dry run's deployment
    file is refused.
  - It saves the event queries in `src/multibaas/labels.ts`, in the Matsuri sample's format: invoices paid, totals
    per payee, payees registered, router payments, MJPY net balances (add/subtract) and MJPY received.
  - `--library-only` adds just the ABIs and queries, before the contracts exist. Then linking a fresh deploy is
    quick, well inside the plan's 100-block backfill (about 10 minutes at Awaji's 6-second blocks).
- **`GET /payments`:**
  - `settled` has every `InvoicePaid`, newest first. Each row has `source: "multibaas"` (at or after
    `multibaasFrom`, the block MultiBaas indexes from) or `"rpc"` (older).
  - `received` has the mJPYC each registered payee got, totalled from `Transfer`: MultiBaas's total from its
    first indexed block plus RPC's before it. `source` may be `"multibaas+rpc"`. That covers the T-numbers asked
    for, or the vendor list by default.
  - `refused` has this agent's holds since it started, newest first. Refusals never reach the chain, so they
    always come from the agent.
  - `source` says where `settled` and `received` came from: `multibaas+rpc`, `multibaas` when the index covers the
    whole history, or `rpc` when MultiBaas isn't configured or can't answer. `notes` explains a fallback, and
    `label` names it, e.g. `Sepolia · via MultiBaas + RPC`.
  - `mizuhiki` is Meigi on Mizuhiki Awaji (`null` when it isn't configured). It has:
    - `label: "Mizuhiki · via MultiBaas"`, plus `chainId`, `network`, `explorer` and `source: "multibaas"`;
    - `token` (`{ symbol, decimals }`, read through MultiBaas's contract call API);
    - `settled[]`: rows as above plus `via: "vault" | "router"`, from `InvoicePaid` and `Paid`;
    - `payees[]`: `{ tNumber, legalName, payout, at, txHash }`, from `PayeeRegistered`;
    - `received[]`: the MJPY each registered payout got.

    When MultiBaas can't answer, or serves another chain, the lists are empty and a `note` says why.
- **`GET /invoices/:id/settlement`:** `confirmed` once MultiBaas has indexed the payment's `InvoicePaid`, and
  `indexing` while it is mined but not indexed yet. A payment older than the index is `confirmed` from its receipt
  (`source: "rpc"`), as is every payment when MultiBaas is off. Before the transaction is mined it is `pending`.
- **Retention:** a free plan keeps indexed events for 72 hours. Rows that have aged out of MultiBaas are still in
  the RPC logs, but this split doesn't fall back to them yet.
- **Live evidence, a vault payment indexed by MultiBaas (2026-09-26):**
  - **The payment:** the agent paid the one-off routine invoice `scripts/evidence/ms-2026-0926.ja.txt` (MS-2026-0926,
    ¥33,000) on its own auto-clear path: p_safe 0.969, every kernel check passed, Intercepta scored the payout 0,
    and there was no force and no approval. Tx `0x56efb5b859c26d0c07de1d3f4b5f9df3d6c3ec834f4605e86f1a57af3fe53eb8`,
    block 11,784,298 (05:58:24 UTC), from the AgentVault to 株式会社メイギ商事's registered payout.
  - **Settlement:** the lookup behind `GET /invoices/:id/settlement` finds the `InvoicePaid` in MultiBaas
    (`source: "multibaas"`), and it matches the paid intent (T-number, amount, invoice reference). The endpoint
    itself first answered `indexing`: MultiBaas's `GET /events` ignores `tx_hash`, and the lookup relied on it.
    It now reads the saved query instead (2a68345).
  - **Mining to indexed:** MultiBaas's row carries the block's own time. The row was already in the saved query at
    the first check, but the broken lookup above meant its exact indexing moment wasn't captured. The closest
    measurement is the x402 run earlier the same day: its transfers were queryable within about 30 s of mining.
  - **What shows it:** `GET /payments` lists the payment with `source: "multibaas"` and the older ones from RPC. The
    site's settlements panel shows "¥33,000 · Invoice paid by the AgentVault · indexed at block 11,784,298".
- **The first payment signed by the signer, with the agent holding no key (2026-09-26):** `scripts/evidence/ms-2026-0927.ja.txt`
  (MS-2026-0927, ¥27,500), auto-cleared.
  - **The payment:** tx `0x8ce2cdc8f98b246f27531a5e8076f98273afa8b8cc8827aaa67bdf0a66040a46`, block 11,784,544
    (06:47:36 UTC).
  - **Settlement:** `GET /invoices/:id/settlement` answered `confirmed` with `source: "multibaas"` at the first check,
    10 s after the block's timestamp. That puts mining-to-indexed at 10 s or less.
  - **Audit:** the log records `analysis` (pay), then `payment` pending, then `payment` paid, and the chain verifies.
- **Keys:** only this service holds the MultiBaas key; the dashboards read `/payments`.
- **Not built yet:** the contract-call API and webhooks.

## Run it

Run these from the repo root.

```sh
pnpm install --filter "@meigi/agent..." --filter "@meigi/signer..."
scripts/ap-stack.sh                       # the signer (.env + .env.signer), then the agent (.env only), supervised
```

`scripts/ap-stack.sh` is how the booth runs it. By hand, it's `pnpm --filter @meigi/signer start`, then
`pnpm --filter @meigi/agent start`.

For a local chain, use four terminals:

```sh
pnpm --filter @meigi/agent local:chain    # anvil :8547, forge Deploy.s.sol, demo vendors; writes both .env.local files
pnpm --filter @meigi/signer dev:local     # the signer on :8797 with anvil's agent key
pnpm --filter @meigi/agent dev:local      # .env overlaid with .env.local (no key)
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

All settings come from the environment; see `.env.example`.
- **Required:** `SEPOLIA_RPC_URL`, `AGENT_ADDRESS`, `SIGNER_TOKEN`, `REGISTRY_ADDRESS` and `VAULT_ADDRESS`.
  `SIGNER_URL` defaults to `http://127.0.0.1:8796`.
- **`AGENT_PRIVATE_KEY` must not be set:** the agent refuses to start if it is. It lives in `.env.signer`, which only
  the signer loads.
- **Startup checks:**
  - the vault's registry and token match the configuration;
  - `AGENT_ADDRESS` is the vault's agent and not its owner;
  - the signer holds that agent's key, for this vault on this chain.
- **The signer's ceiling** becomes the agent's auto-clear budget, so a payment the signer would refuse holds here for
  a verified human.

| Area | Default |
|---|---|
| Triage | `TRIAGE_BACKENDS=systemone,proxy`, `SYSTEMONE_URL=http://127.0.0.1:8102/v1/systemone`, `TRIAGE_MIN_P_SAFE=0.9`, `TRIAGE_REQUIRED=true` |
| LLM | `LLM_PROVIDER=local` (the default for demos: a model on this machine behind an OpenAI-compatible API, `LOCAL_LLM_URL=http://127.0.0.1:11434/v1`, `LOCAL_LLM_MODEL=llama3.1:8b`, `LOCAL_LLM_TIMEOUT_MS=60000`), `proxy` (Llama 3.3 via `AI_PROXY_URL/v1/chat` with `AI_PROXY_TOKEN`), `anthropic` (`ANTHROPIC_API_KEY`, `claude-haiku-4-5`), `workers-ai` or `none` |
| Screening | `INTERCEPTA_API_KEY` (optional), `INTERCEPTA_CACHE_PATH=../../data/agent/intercepta-cache.json`, `INTERCEPTA_MAX_CALLS=900`, `INTERCEPTA_TOXIC_THRESHOLD=50` |
| Judgement holds | `TRIAGE_MAX_PRESSURE=0.5`, `AUTO_CLEAR_MAX_YEN` (unset: the signer's ceiling, ¥150,000, is the budget) |
| Signer | `AGENT_ADDRESS`, `SIGNER_URL=http://127.0.0.1:8796`, `SIGNER_TOKEN` (the same value as in `.env.signer`) |
| Audit log | `AUDIT_LOG_PATH` (default `../../data/agent/audit-<CHAIN_ID>.jsonl`, relative to services/agent) |
| Settlement history | `MULTIBAAS_URL` and `MULTIBAAS_API_KEY` (the agent's chain), `MULTIBAAS_AWAJI_URL` and `MULTIBAAS_AWAJI_API_KEY` (Mizuhiki Awaji); each pair both or neither, https only. `HISTORY_FROM_BLOCK` (RPC log scans; default 11781105 on Sepolia, 0 elsewhere) |
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
- **Live (2026-09-26):**
  - The registered payouts and our own demo attacker wallets all score 0. Fresh wallets have no history, which is
    why the registry, not screening, stops 02, 04 and 06.
  - The Ronin bridge exploiter (example 08) scores `toxicScore` 100, with `known_scammer`, `sanction_address` and
    `blacklist`.
  - A run of all eight examples used 5 calls.

## Demo documents

`scripts/demo-invoices/` holds eight documents. `vendors.json` lists the fictional vendors and the expected outcomes.

| File | Expected |
|---|---|
| `01-routine-invoice.ja.txt` | Pays: registered payout, within caps, adds up |
| `02-bank-change-bec.ja.txt` | Holds; force shows the `PayeeMismatch` revert and names 株式会社メイギ商事 |
| `03-fake-ceo-urgent.en.txt` | Holds; force shows the `VendorNotApproved` revert |
| `04-prompt-injection.ja.txt` | Holds as tampering (hidden address); force refused |
| `05-credit-note.ja.txt` | Holds; never paid |
| `06-x402-swapped-payto.json` | Holds; force shows the `PayeeMismatch` revert on Sepolia |
| `07-urgent-invoice.ja.txt` | Genuine but urgent (至急): holds for `pressure_hold`. A verified human approves it, then it pays; a denial or expiry pays nothing, and force answers `force_needs_human`. |
| `08-bank-change-flagged-wallet.ja.txt` | Holds on `payout_mismatch` (`PayeeMismatch`) and `screening_flagged`: the new wallet is the Ronin bridge exploiter, which Intercepta flags `known_scammer` with toxic score 100. Force is refused unsimulated, and no person can approve it. Needs `INTERCEPTA_API_KEY`; without it, only the kernel's hold remains. |

Every T-number has a valid 法人番号 check digit and is absent from the nationwide NTA index (5,787,472 corporations).
Bayside's number, T3999905000001, uses registry office 9999, which doesn't exist.
