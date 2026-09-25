# apagent: Build the Meigi AP agent service

Agent type `oh-my-claudecode:executor`, started Sat 03:06 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

Build `services/agent`: the Meigi accounts-payable (AP) agent service. This is for ETHGlobal Tokyo 2026 on the From Scratch track; write everything now, and public libraries are fine. Repo: <workspace>/meigi.

Read first:
- contracts/README.md
- contracts/src/payments/AgentVault.sol
- contracts/src/registry/IPayeeRegistry.sol
- packages/abi (typed ABIs: import { agentVaultAbi, payeeRegistryAbi, mockJPYCAbi } from "@meigi/abi")
- services/verifier/src as the house style reference: Hono + zod + viem, dependency injection, vitest, small files
- research/IDEA-MEIGI.md, sections 1, 2B and 5a

What it is:
- An AI agent reads supplier invoices (Japanese qualified invoices, emails, or x402 402-responses) and pays from an on-chain AgentVault with its own key, AGENT_PRIVATE_KEY.
- The vault only lets it pay approved vendors (by T-number) to their registered payout. A swapped address reverts `PayeeMismatch(tNumber, expected, registered)`.
- Demo line: "Please try to rob it." A judge writes a fake invoice; the agent's LLM reasoning may agree to pay; the chain refuses and names the real company.

Architecture (three layers; only the kernel can move money):
1. **Extraction (deterministic):** regex and parsing for T-number(s) (`T\d{13}`), wallet addresses, the amount (¥, 円, JPYC, commas, 全角 digits via NFKC), the invoice number and the due date. Flag ambiguity: several addresses or T-numbers, or an amount mismatch between the total and the line items.
2. **System-1 triage:** POST to a `/v1/systemone`-compatible endpoint (Kev served locally, or Jev) with `{state, questions}`. Questions:
   - request_type (choice: routine_invoice | payee_change | urgent_exec_request | credit_note | other)
   - new_destination (noul)
   - pressure (noul)
   - suspicion (score over 4 levels)
   Return typed answers with confidence. Route to auto-clear only on high confidence + routine + no flags; everything else holds. Config: SYSTEMONE_URL (default http://localhost:8009/v1/systemone), optional SYSTEMONE_API_KEY. Also support Jev over Cloudflare: POST https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run with body {"model":"typesafe/jev","input":{state,questions}} and a Bearer CLOUDFLARE_API_TOKEN; it may return 402 until credits exist, so handle that gracefully. If no triage backend is reachable, report "triage unavailable" rather than faking results.
3. **Deterministic kernel:**
   - registry.payeeOf(t): active? payout equals the invoice address?
   - vault.vendors(t): approved, active (activeAt), pinned payout equals the registry payout?
   - amount within capPerPayment / remainingInPeriod?
   - invoicePaidAmount(t, ref)?
   - It produces a verdict (pay | hold) and machine-readable reasons, each with the registered legal name.
4. **Screening (Intercepta / Web3 Antivirus):** `GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan` with header `X-API-KEY: $INTERCEPTA_API_KEY` → toxicScore + traits. Treat it as optional and budget-aware (a 1,000-call key; cache results by address in-process and on disk under data/). If the key is missing, say "screening unavailable". Never mock the results.
5. **LLM layer (System 2):**
   - (a) The naive "agent proposal": the LLM reads the invoice and proposes a payment (tNumber, address, amount, reasoning). It is deliberately gullible. It is shown in the console but can never move money by itself.
   - (b) A short human explanation of any hold or revert.
   - Provider set by LLM_PROVIDER = anthropic | workers-ai | none.
     - anthropic: ANTHROPIC_API_KEY, model claude-haiku-4-5 or the latest Haiku.
     - workers-ai: Cloudflare REST `.../ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast` with CLOUDFLARE_API_TOKEN.
     - none: skip.
   - Write the explanation from structured facts only; never let the LLM decide the verdict.
6. **Payment:**
   - `payInvoice(tNumber, expectedPayout, amount, invoiceRef)` from the agent key. invoiceRef = keccak256 of "T-number|invoice number".
   - ALWAYS simulate first. On revert, decode the custom error with the ABI into a sentence, e.g. "T2011001234567 = 株式会社メイギ商事 pays 0xA1…; this invoice asked for 0xBE…".
   - A `force: true` flag lets the demo send the payment the kernel would hold, to show the on-chain revert. Still simulate it, and report the decoded revert without broadcasting a failing tx.

HTTP API (Hono, CORS for APP_ORIGINS, zod-validated bodies, 64 KB limit, errors never leak stacks):
- `POST /invoices/analyze` `{ text }` → `{ id, extracted, triage, kernel, screening, verdict, proposal, explanation, timings }`. Keep the analysis in memory by id.
- `POST /invoices/:id/pay` `{ force?: boolean }` → `{ status: "paid", txHash } | { status: "reverted", error: { name, args, sentence } } | { status: "held", reasons }`.
- `GET /vault` → { agent, vault, token, balance, vendors: [...] } for a configured VENDOR_T_NUMBERS list (comma-separated).
- `GET /health`.

Env: read from <workspace>/meigi/.env via `--env-file`.
- Variables: SEPOLIA_RPC_URL, CHAIN_ID (default 11155111), AGENT_PRIVATE_KEY, REGISTRY_ADDRESS, VAULT_ADDRESS, TOKEN_ADDRESS (not deployed yet), plus the optional keys above.
- Validate with zod and never print secrets.

Testing:
- vitest unit tests with fakes, for the extraction edge cases (全角 digits, several addresses, prompt-injection text) and the kernel verdicts.
- Plus an integration test against a local anvil at port 8547:
  - deploy with `forge script contracts/script/Deploy.s.sol` using anvil's default keys, the same way I dry-ran it
  - register a payee via the attester
  - approve the vendor
  - fund the vault by minting MockJPYC
  - show a real payment succeeding, and a swapped-address invoice reverting `PayeeMismatch` with a decoded sentence
- Also add `scripts/demo-invoices/` with 4–6 realistic fake invoices in Japanese and English (routine, bank-change BEC, fake-CEO urgent, prompt injection hidden in the invoice, credit note), all for fictional companies with valid 法人番号 check digits.

Rules:
- Package name @meigi/agent, TypeScript 7, viem ~2.56.8. Install with `pnpm install --filter @meigi/agent...` from the repo root; retry if another agent is holding the lockfile.
- Files under 400 lines, functions under 50, no console.log (write to stderr only for startup/errors), explicit error handling.
- Only touch services/agent (and scripts/demo-invoices under it).
- No git commits (I'll commit). No real-chain transactions (anvil only).

Report back:
- the endpoints
- how to run it
- the test results
- what's needed for the Sepolia run (addresses and keys)

## Follow-up instructions

### Sat 03:17 JST: Use the deployed AI proxy for LLM and Jev

An LLM and a Jev backend are now available through our deployed Cloudflare Worker. Use it instead of the raw Cloudflare REST API; there's no API token for that.

- Base URL: env `AI_PROXY_URL`, already https://meigi-ai-proxy.karanbishttt.workers.dev. Auth: `Authorization: Bearer $AI_PROXY_TOKEN`. Both are in meigi/.env; never print the token.
- `POST /v1/chat` with `{ messages: [{role, content}], max_tokens?, temperature? }` → Workers AI Llama 3.3 70B. The response is OpenAI-style (`choices[0].message.content`). Verified working.
- `POST /v1/systemone` with `{ state, questions }` → TypeSafe Jev. It currently returns HTTP 402 `{code: "insufficient_credits"}` until the user tops up; treat that as "Jev unavailable" and fall back to the local Kev endpoint (SYSTEMONE_URL).

So: LLM_PROVIDER=proxy should be the default (keep `anthropic` optional). The triage order is Jev via proxy → Kev local → "triage unavailable".

### Sat 03:25 JST: Sepolia addresses are live

The contracts are live on Sepolia (see contracts/deployments/11155111.json; also in meigi/.env).
- REGISTRY_ADDRESS=0xB2D61a2d1EF2C340F8b4cf9ec90E1eDCB08a6e84
- VAULT_ADDRESS=0x20554C36fe044d4725Fd1C9798fDA69e9a49f74D
- TOKEN_ADDRESS=0xEcA2B093682a46B14b143474d188A120bA2d0EC2 (MockJPYC "mJPYC", 18 decimals)

The vault holds 5,000,000 mJPYC. Vendor `T2011001234567` (fictional 株式会社メイギ商事, payout `0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4`) is approved, with caps of ¥500k per invoice and ¥1M per 30 days. It becomes active about 1h after 03:26 JST. Until then payInvoice reverts VendorNotYetActive, which your decoder should render nicely too.

- AGENT_PRIVATE_KEY in .env is the vault's agent and holds 0.05 Sepolia ETH.
- DEMO_SCAMMER in .env is an address to use in fake invoices.
- Set VENDOR_T_NUMBERS=2011001234567.

Keep testing on anvil first. Sepolia simulations (eth_call) are fine; send real Sepolia transactions only for the final smoke test: one legit ¥1,000 payment after activation, plus one simulated swapped-address revert.

### Sat 03:42 JST: Intercepta response shape + reuse the guard client

Intercepta quick-scan response, from their OpenAPI:
- `{ toxicScore: number, traits: Array<{ name: "known_scammer" | "fake_phishing_transfer" | "sanction_address" | "mixer_transfers" | "rug_pull" | "blacklist" | …, risk: number, txsCount: number, description: string }> }`
- Endpoint: GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan with header X-API-KEY.

A ready client exists: `import { interceptaScreen } from "@meigi/x402-guard"`. It returns `{ flagged, summary }`, caches per address, and never caches failures. Reuse it (add "@meigi/x402-guard": "workspace:*") instead of writing another, or mirror its trait handling (traits are objects; use .name).

The key isn't here yet (INTERCEPTA_API_KEY unset). Screening must report "unavailable", never mock data.

### Sat 03:51 JST: Contracts v2: new addresses + ABI changes

The contracts were redeployed (v2) after a second review round. meigi/.env now has the new REGISTRY_ADDRESS (0x205c977cF1f4Ed42e51a48759550eF40160A6396), VAULT_ADDRESS (0x87A798CD92dE1340B1b761dd45196AC82bEF793B) and REGISTRY_FROM_BLOCK. TOKEN_ADDRESS is unchanged.

The vault holds 5M mJPYC. Vendor T2011001234567 is approved again and becomes payable about 1h from 04:05 JST.

ABI changes (packages/abi is regenerated; re-import):
- `approveVendor(uint64 tNumber, address expectedPayout, uint128 capPerPayment, uint128 capPerPeriod)` now takes the payout the owner reviewed. Update your anvil integration setup.
- `isInvoicePaid` is REMOVED. Use `invoicePaidAmount(t, ref)` and compare it with the invoice total.
- `remainingInPeriod` now returns 0 when the registry payout no longer matches the pinned one.
- The registry has `dismissDispute` and a new `AttesterRevoked` error. PayeeRegistry's constructor requires changeDelay >= 1h, so use 72h on anvil too.

### Sat 04:01 JST: pnpm install fixed (allowBuilds)

If you hit ERR_PNPM_IGNORED_BUILDS / verify-deps failures: fixed. pnpm-workspace.yaml now has `allowBuilds: esbuild: true`, and `pnpm install` exits 0.

### Sat 04:01 JST: Bug: seed.ts uses old approveVendor arity

Integration bug found by review: services/agent/scripts/stack/seed.ts:74 still calls `approveVendor(tNumber, capPerPayment, capPerPeriod)`. The v2 ABI is `approveVendor(tNumber, expectedPayout, capPerPayment, capPerPeriod)`, so viem throws before sending. Pass the vendor's registered payout as the second argument, and check any other callers the same way.

### Sat 04:48 JST: Use our fine-tuned System-1 model at :8102

Our fine-tuned System-1 model (payee-0.8b) is being served locally at http://127.0.0.1:8102/v1/systemone (kev.serve, the same /v1/systemone contract as Jev). On PayeeBench-JA it scores 0.920 mean accuracy with ECE 0.025, vs the released Kev-4B at 0.793. Use it as the default triage backend (SYSTEMONE_URL=http://127.0.0.1:8102/v1/systemone), with Jev via the proxy when credits exist. Its questions match your schema (request_type, new_destination, pressure, suspicion); check bench/payeebench for the exact question text and criteria, and reuse them verbatim so the served model sees the wording it was trained on.

### Sat 04:50 JST: Fix the 4 HIGH findings before anything else

I've read your reviewer's round-2 report (REQUEST CHANGES). Fix issues 1–4 before anything else; each lets money leave wrongly. Design rules to apply:

1. **Credit notes / refunds are never payable.** Any 返還/返金/返品/credit/refund wording anywhere in the document, or any total labelled 返還金額/返金額, classifies it as a credit note and BLOCKS. Position in the document doesn't matter.
2. **Force is an allow-list, not a deny-list.** `force` may override only these holds: triage hold, urgency/pressure, prompt-injection-detected, and the chain-checked payee/vendor reasons, because the on-chain revert is the demo. It must never override document-integrity blocks:
   - credit note
   - hidden content
   - ambiguous or conflicting totals
   - missing invoice number
   - missing T-number
   - multiple addresses or T-numbers
3. **Totals:** if a line is labelled as the amount due (ご請求金額, 差引ご請求金額, お支払金額, 合計金額, "amount due"/"total due") and has exactly one amount, use it. If there's more than one candidate, or it conflicts with subtotal+tax without an explained adjustment line, BLOCK as ambiguous. Never silently drop a labelled total line.
4. **Hidden content:** extract only from visible text. Strip HTML comments, `display:none`/`visibility:hidden`/`font-size:0`/white-on-white elements, and zero-width characters first. If the removed content contains any amount (including 万円/千円 forms), any T-number (with or without "T", labelled or not), or any address, BLOCK as tampering.
5. **Screening (low):** restore the broader severe-trait list (keep fake_phishing_transfer, mixer_transfers, etc.) and the threshold of 50 unless you have a reason; report the reason if you change it.

Add a regression test for every reproduced case in the report (the ¥22,000 refund, the ¥82,000 net total, 45万円 in a comment, display:none, the unlabelled 7010003945167), then have your reviewer re-verify. When it passes, send me the final report. Don't commit; I'll review and commit.

### Sat 04:57 JST: Check demo-invoice T-numbers nationally

Thanks for catching T2010401000001: it's now frozen on-chain via dispute, and the merchant moved to T8999900000001 (registry office 9999 doesn't exist). A nationwide NTA index is at meigi/data/nta/corporations.sqlite (5,787,472 corporations; `number` holds the 13 digits).

Please check every T-number in services/agent (demo invoices, tests, seed scripts) against it, not just Tokyo, and replace any real company's number with a 9999-office number that has a valid check digit. For example, 合同会社ベイサイド・アドバイザリー's number in the fake-CEO invoice must not belong to a real company.

After the 4 HIGH fixes and your reviewer's pass, send the final report. Don't commit.

### Sat 05:06 JST: Round-3 findings A, C, D: fail-closed fixes, time-boxed

I read the round-3 re-verification (A, C, D). Please fix these with the reviewer's fail-closed rules, not with more parsing:

- **D:** any HTML markup outside a tiny safe set (e.g. p, br, div, span, table, tr, td, th, b, strong, with no style/class attributes) blocks auto-pay. Force can't override this block, and the explanation says the document contains formatting a reader might not see.
- **C:** a total line with more than one amount blocks as ambiguous. The only exception is a single うち消費税 / 内消費税 note. A qualifier inside the total's own label, such as （消費税込）, must not disqualify it. Keep the plain case "ご請求金額（消費税込）¥132,000" payable, and add all three of the reviewer's strings as tests.
- **A:** block when triage classifies the document as a credit note. Also require bill wording (請求 / ご請求 / invoice / amount due / payment due) before anything is payable. Add 払い戻し and reimburse to the refund words and test both reviewer strings.

Time box: about 45 minutes. Then run tsc, vitest and the anvil test, and send me the final report with:
- the national T-number check result;
- a README for services/agent that lists the endpoints, how to run it, the triage backend (Kev at :8102), and where Intercepta is called.

Don't start another review round yourself; I'll do the final review. Don't commit.
