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
| Payment | Always simulates first; a simulated revert is decoded into a sentence and never broadcast. | `src/chain/payer.ts`, `src/analysis/pay.ts` |

## Endpoints

The server listens on `http://127.0.0.1:8788`. POSTs must send `content-type: application/json`, and a bearer token too
if `AGENT_API_TOKEN` is set.

| Method | Path | Returns |
|---|---|---|
| POST | `/invoices/analyze` `{ text }` (≤ 60,000 chars) | `{ id, createdAt, extracted, triage, proposal, kernel, screening, verdict, explanation, timings }`. The analysis is kept in memory by `id`. |
| GET | `/invoices/:id` | The stored analysis |
| POST | `/invoices/:id/pay` `{ force?: boolean }` | See the payment results below |
| GET | `/vault` | `{ agent, vaultAgent, agentAuthorized, vault, registry, owner, token, balance, paused, vendorDelaySeconds, vendors[] }` |
| GET | `/demo/invoices` | The documents in `scripts/demo-invoices/` with the manifest |
| GET | `/health` | `{ ok, chainId, vault, agent, triage, llm, screening }` |

A payment returns one of:

- `{ status: "paid", txHash, blockNumber, payTo, amount, invoiceRef, forced }`
- `{ status: "pending", txHash }`: sent, receipt not seen yet. POST again to settle it; it is never resent.
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
- **What force may override:** triage holds, pressure, prompt injection, and the payee/vendor reasons the vault
  enforces itself.
- **What force never overrides** (`force_refused`): credit notes, hidden content, markup, bidirectional controls,
  ambiguous or conflicting totals, missing invoice numbers or T-numbers, several addresses, and screening hits.
- **Where values come from:** the T-number and amount always come from the document. Only the destination may come
  from the agent's proposal, and the vault rejects any address that isn't the registered one.
- **Explanations:** the explaining LLM sees kernel facts only, never document text. Document quotes travel in
  `evidence` for the console.

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

`scripts/demo-invoices/` holds six documents. `vendors.json` lists the fictional vendors and the expected outcomes.

| File | Expected |
|---|---|
| `01-routine-invoice.ja.txt` | Pays: registered payout, within caps, adds up |
| `02-bank-change-bec.ja.txt` | Holds; force reverts `PayeeMismatch` and names 株式会社メイギ商事 |
| `03-fake-ceo-urgent.en.txt` | Holds; force reverts `VendorNotApproved` |
| `04-prompt-injection.ja.txt` | Holds as tampering (hidden address); force refused |
| `05-credit-note.ja.txt` | Holds; never paid |
| `06-x402-swapped-payto.json` | Holds; force reverts `PayeeMismatch` on Sepolia |

Every T-number has a valid 法人番号 check digit and is absent from the nationwide NTA index (5,787,472 corporations).
Bayside's number, T3999905000001, uses registry office 9999, which doesn't exist.
