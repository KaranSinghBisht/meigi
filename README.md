# Meigi (名義)

**Confirmation of Payee for stablecoins and AI agents. Pay companies, not addresses.**

**In one sentence:** Meigi binds a Japanese company's invoice registration number (T-number) to one on-chain
payout. The number and exact name are matched to the NTA corporate registry (法人番号), the registrant proves control
of a domain, and World ID officers enroll. People, wallets and AI agents paying in stablecoins can then refuse a
swapped address before any money moves.

- **Live:** [meigi.karanbishttt.workers.dev](https://meigi.karanbishttt.workers.dev) is one site: the landing,
  and "enter" glides into the app. The registry explorer, ENS check and event feed read Sepolia live. Steps that need our services show recorded real
  runs.
- **Runs on:**
  - **Ethereum Sepolia:** everything (registry, AgentVault, PayRouter, ENSv2 names, x402 in mJPYC).
  - **Mizuhiki's Awaji testnet** (chain 6497): the registry and PayRouter, paid in Mizuhiki's own MJPY and MUSD,
    and x402 settled in MJPY. Awaji has no AgentVault and no ENS. See [docs/mizuhiki.md](docs/mizuhiki.md).
- **Team:**
  - Karan Singh Bisht, GitHub [@KaranSinghBisht](https://github.com/KaranSinghBisht);
  - Adithya Prasanna Suriya Prakash, handle: TODO (Adithya to add).
- **Event:** ETHGlobal Tokyo 2026, From Scratch track.

A stablecoin payment goes to an address, and nothing checks that the address belongs to the company you mean
to pay. Three attacks all end the same way, with the money redirected:
- a fake "our bank details changed" email;
- a prompt injection hidden in an invoice;
- a hacked x402 server that swaps `payTo`.

Banks fixed this for wires with Confirmation of Payee. Stablecoins, and the AI agents now paying with them,
have nothing like it.

Every Japanese company that issues qualified invoices prints a public, government-issued **T-number** on
them. Japan comes first, but the design is global: any official business identifier works the same way, and the
verifier already checks the global **LEI**. Meigi binds a T-number to **one payout address**:
- **registered** only after an exact name match against the NTA corporate registry (法人番号), a DNS proof on a
  domain the registrant controls, and World ID officers;
- **changed** only through a **72-hour public window**: either the company's business key together with its World
  ID officers (each proof checked by our verifier, whose co-signature the registry verifies on-chain), or a
  governance ruling on a dispute. Nothing changes it instantly;
- **enforced** on-chain when money moves.

Registration doesn't yet prove that the registrant *represents* the company. That binding, through the
商業登記電子証明書, is the production step. The threat model, our compliance posture and the roadmap are in
[`docs/trust-and-compliance.md`](docs/trust-and-compliance.md).

```mermaid
flowchart LR
  NTA["NTA corporate-number registry<br/>5.79M records, 5.0M open"] --> V[Verifier / attester]
  DNS[DNS TXT proof] --> V
  W["World ID 4.0 officers<br/>(IDKit sessions)"] --> V
  V -- "EIP-712 attestation" --> R[("PayeeRegistry<br/>T-number → payout")]
  R --> E["t2011001234567.payee.eth<br/>ENSIP-10 resolver"]
  R --> A["AgentVault<br/>the AI agent's wallet"]
  R --> X["x402 guard<br/>+ Intercepta screening"]
```

**"This is our AI accountant. It holds JPYC, reads every invoice, and only pays verified companies."** Write it a fake
invoice or a bank-change email, or hide a prompt injection. Its LLM may well agree to pay the scammer. Then
the vault reverts `PayeeMismatch` and names the registered company.

## Try it without installing anything

- **The landing page** reads the registry live: https://meigi.karanbishttt.workers.dev → "Resolve a T-number" →
  `T2011001234567`.
- **The registry explorer** shows the live payee, its ENS name and the event feed:
  https://meigi.karanbishttt.workers.dev/registry/T2011001234567.
- **ENS, from any client.** `t2011001234567.payee.eth` resolves on Sepolia with stock viem and no
  configuration:
  ```sh
  (cd apps/landing && RPC_URL=https://ethereum-sepolia-rpc.publicnode.com node --input-type=module) < contracts/script/ens/check-viem.mjs
  # {"address":"0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4","legalName":"株式会社メイギ商事","status":"active",…}
  ```
  ENS's agent CLI makes the same viem calls (`ens get address t2011001234567.payee.eth --chain sepolia`,
  `ens get name 0x87A798CD92dE1340B1b761dd45196AC82bEF793B --chain sepolia`). We haven't run it ourselves, because it
  ships only as an unpinned preview build. The profiles show in the ENSv2 app, e.g.
  [app.ens.dev/t2011001234567.payee.eth](https://app.ens.dev/t2011001234567.payee.eth).
- **x402:** an honest purchase settled on Sepolia in
  [`0xf3c29896…77b0df`](https://sepolia.etherscan.io/tx/0xf3c298960b9abac5466f4aa6e59f9a9ba4b73de703df3468d72f18049077b0df).
  The same merchant with a swapped `payTo` is refused before anything is signed.

## How each piece works

| Piece | What it guarantees | Code |
|---|---|---|
| **PayeeRegistry** | T-number → one payout. A second claim freezes the number (dispute); it is never overwritten. A payout changes only after 72h in public (set at deploy; the contract enforces at least 1 hour): through the business key **and** its World ID officers (one attester signature on-chain, after our verifier checks each officer's proof), or through a governance ruling on a dispute. The controller, attester or governance can cancel a requested change; only governance can dismiss a queued ruling. | [`contracts/src/registry`](contracts/src/registry) |
| **PayeeResolver** (ENS) | `t<13 digits>.payee.eth` resolves to the active payout only. Unknown or disputed numbers resolve to nothing, and a queued change never resolves early. | [`contracts/src/ens`](contracts/src/ens) |
| **AgentVault** | The agent's key can only pay owner-approved vendors, within caps, to the payout the owner pinned, which must still be the registry's. A swapped address reverts `PayeeMismatch`; a registry change reverts `VendorPayoutChanged`. | [`contracts/src/payments`](contracts/src/payments) |
| **Verifier** | Exact match against the NTA bulk data after NFKC normalisation. Keybase-style DNS proof. World ID 4.0 officer sessions. Approvals whose World ID signal pins the exact change. **Global:** `GET /lei/:lei` verifies any company's LEI against GLEIF and links Japanese ones to their T-number. For example, Sony Group's LEI links to `T5010401067252`. | [`services/verifier`](services/verifier) |
| **AP agent** | Invoice → deterministic extraction → System-1 triage (our fine-tuned model) → deterministic kernel → Intercepta screening → pay or hold. Only the kernel can move money; the LLM only explains. **The agent holds no key:** a separate signer does, signs only `payInvoice` after simulating it, and needs a verified human's approval above ¥150,000. | [`services/agent`](services/agent), [`services/signer`](services/signer) |
| **x402 guard** | Before an agent signs an x402 payment: a declared T-number must match `payTo`. Merchants that declare none get at most a small allowance (¥50 by default) after a clean Intercepta screen, or nothing. | [`packages/x402-guard`](packages/x402-guard), [`services/x402-demo`](services/x402-demo) |
| **PayeeBench-JA** | A Japanese-first benchmark for triaging payment redirection. Kev-0.8B, fine-tuned on a MacBook, scores 0.918 accuracy. That beats the released Kev-4B (0.795) and Llama 3.3 70B (0.815), with ECE 0.024, at 39 ms. | [`bench`](bench) |
| **Web app / landing** | Registry explorer with a live event feed, registration, officer approvals, agent console and x402 demo; a three.js "Sakasa Fuji" landing page. | [`apps/web`](apps/web), [`apps/landing`](apps/landing) |

## Sponsor integrations

- **ENS (ENSv2, Sepolia): two namespaces as verifiable identity and delegated authority.**
  - `payee.eth` names companies. [`PayeeResolver`](contracts/src/ens/PayeeResolver.sol) answers every
    `t<13 digits>.payee.eth` from the registry at call time (ENSIP-10), so millions of T-numbers resolve without
    minting. A company can also claim its name as an ENSv2 token for its own profile; its payout still comes from
    the registry. Claimed names are soulbound (no transfer role), expire with `payee.eth`, and Meigi can revoke them.
  - `meigi.eth` names agents. `ap.meigi.eth` is the AP agent, with ENSIP-26 records. It is linked to ERC-8004 agent
    10525 per ENSIP-25. Its key can edit only `agent-status` (Enhanced Access Control), and it is the AgentVault's
    ENSIP-19 primary name.
  - The names survive changing keys. Payouts and business keys change behind a 72h public timelock, and
    `ens.sh agent-rotate` moves the agent to a new key without changing `ap.meigi.eth` (fork-tested).
  - Anyone can check them with stock viem and no configuration. The story and evidence: [`docs/ens.md`](docs/ens.md);
    scripts: [`contracts/script/ens`](contracts/script/ens).
- **World ID (IDKit 4.0).**
  - An officer enrolls once with an IDKit session.
  - A payout change the company requests needs `proveSession` from the same human, with a signal that binds
    chain, registry, T-number, action, target, nonce and deadline.
  - The proof is verified server-side, then turned into an EIP-712 approval the contract checks.
  - Code: [`services/verifier/src/world/session.ts`](services/verifier/src/world/session.ts),
    [`services/verifier/src/routes/intents.ts`](services/verifier/src/routes/intents.ts),
    [`apps/web/src/ui/world`](apps/web/src/ui/world),
    [`contracts/src/registry/OfficerQuorum.sol`](contracts/src/registry/OfficerQuorum.sol).
- **Curvegrid (Best AI Agent Project) and MultiBaas.** Meigi on Mizuhiki, indexed and queried through MultiBaas, like
  Curvegrid's Matsuri sample. A second deployment indexes our Sepolia contracts live. See
  [below](#curvegrid-best-ai-agent-project).
- **Intercepta** (screening; not a prize target). The quick-scan runs before signing, and without a key it fails
  closed. Code: [`packages/x402-guard/src/intercepta.ts`](packages/x402-guard/src/intercepta.ts) (the call);
  `checkPayee` and `checkUndeclared` in [`check.ts`](packages/x402-guard/src/check.ts) (the decisions);
  `services/agent/src/screening` (the AP agent).

### Curvegrid: Best AI Agent Project

Meigi's AP agent is three of the ideas in Curvegrid's brief:
- **Stablecoin Payment Agent.** It reads Japanese invoices, pays them in mJPYC (our JPYC stand-in on Sepolia) and
  tracks settlement: `GET /invoices/:id/settlement` confirms each payment from MultiBaas's index.
- **Policy-Aware Transaction Agent.** It pays only owner-approved vendors, only to the payout registered for their
  T-number, and only within per-vendor caps, all enforced by the AgentVault. Above ¥150,000 the signer won't sign
  without a verified human's approval.
- **Agent-to-Agent Payments.** Before a buying agent signs an x402 payment, the x402 guard checks a declared
  merchant's `payTo` against the registry and, where it declares one, the merchant's ENS name. A merchant that declares none gets at most a
  small screened allowance (¥50 by default), or nothing.

At the Curvegrid workshop, Jeff Wentworth named three danger zones for agents that move money. Here is where Meigi
handles each:
- **No private keys in the agent.**
  - The agent holds no key, and refuses to start if one is in its environment.
  - A separate signer ([`services/signer`](services/signer), loopback only) holds the vault's agent key and signs
    one call, `AgentVault.payInvoice`. It builds that call from typed fields and simulates it first.
  - [`scripts/ap-stack.sh`](scripts/ap-stack.sh) runs both.
- **Prompts aren't policy.** The LLM only proposes and explains. A deterministic kernel decides, and the vault
  re-checks the vendor, the payout and the caps on-chain.
- **Human accountability.**
  - Risky payments wait for a verified human, who approves through World ID for Agents. The signer won't sign
    anything above ¥150,000 without that approval.
  - A hash-chained audit log records every verdict, approval and payment, and `GET /audit?verify=1` checks the
    chain.

### How we use Curvegrid MultiBaas

Meigi on Mizuhiki, indexed and queried through MultiBaas, like Curvegrid's Matsuri sample. We run two MultiBaas
deployments, one per chain:
- **Mizuhiki Awaji** (chain 6497): PayeeRegistry, PayRouter and MJPY (there is no AgentVault on Awaji), with
  addresses in [`contracts/deployments/6497.json`](contracts/deployments/6497.json). Events are indexed from their
  deploy block, including the x402 sale settled in MJPY ([docs/mizuhiki.md](docs/mizuhiki.md)).
- **Ethereum Sepolia:** PayeeRegistry, AgentVault, PayRouter and mJPYC, the contracts the live demo uses. They were
  linked 100 blocks back, as far as the free plan's backfill reaches (block 11783796). From there, every payment and
  x402 sale is indexed live.

The details:
- **Queries.** Six saved event queries, in the format of Curvegrid's Matsuri sample:
  - `meigi_invoices_paid`: every `InvoicePaid` the vault emitted;
  - `meigi_invoices_by_payee`: `InvoicePaid` summed per T-number;
  - `meigi_payees_registered`: every company the registry recorded, with its exact registered name;
  - `meigi_router_paid`: every pay-by-T-number `Paid` through the PayRouter;
  - `meigi_mjpy_balances`: net MJPY per account, the way the Matsuri sample computes balances (`add` for the
    recipient, `subtract` for the sender);
  - `meigi_mjpy_received`: MJPY summed per recipient.
- **What reads it.** The AP agent's `GET /payments` feeds the dashboards.
  - **Sepolia section:** MultiBaas's rows from the link block on (`source: "multibaas"`), and RPC logs read with
    viem for the older history (`source: "rpc"`), merged with no block counted twice.
    `GET /invoices/:id/settlement` confirms each new payment from its indexed `InvoicePaid`.
  - **`mizuhiki` section,** labelled "Mizuhiki · via MultiBaas":
    - payments by the vault and the router;
    - registered payees;
    - what each payee received;
    - the token's decimals, read through the contract call API.
  - **The hosted site.** The meigi Worker answers `GET /api/settlements` from MultiBaas server-side, with the key
    kept as a Worker secret. The agent console's "Settlements · indexed by Curvegrid MultiBaas" panel shows the
    rows live: amount, payee (ENS name and T-number), tx and "indexed at block N".
- **Setup:**
  1. Put `MULTIBAAS_URL` / `MULTIBAAS_API_KEY` (Sepolia) and `MULTIBAAS_AWAJI_URL` / `MULTIBAAS_AWAJI_API_KEY` in
     `.env`. Sepolia is linked with `pnpm --filter @meigi/agent multibaas:setup --from-block -100`.
  2. Before deploying, run `pnpm --filter @meigi/agent multibaas:setup --awaji --library-only`. It adds the ABIs
     and saves the queries.
  3. Right after the forge broadcast, run `pnpm --filter @meigi/agent multibaas:setup --awaji`. It aliases and
     links the contracts from the broadcast's first block, well inside the 100-block backfill (about 10 minutes
     at Awaji's 6-second blocks).
  4. Restart the agent; `/health` shows `"mizuhiki": true`.
- **Tests:** `pnpm --filter @meigi/agent test` runs them against a stub MultiBaas, including a deployment on the
  wrong chain, which is never read or written. `pnpm --filter @meigi/agent test:integration` runs the RPC path on
  anvil.
- **Code:** [`services/agent/src/multibaas`](services/agent/src/multibaas),
  [`services/agent/src/history`](services/agent/src/history),
  [`services/agent/src/routes/payments-mizuhiki.ts`](services/agent/src/routes/payments-mizuhiki.ts),
  [`apps/web/worker`](apps/web/worker) (the site's settlements API) and
  [`apps/web/src/features/settlements`](apps/web/src/features/settlements) (the panel).
- **Next steps:**
  - build `payInvoice` with the contract-call API and sign locally;
  - add an `event.emitted` webhook behind a public relay;
  - move the AP agent itself to Awaji once ENS and World ID are reachable from there.

### Our experience with MultiBaas

On Sepolia, live since 2026-09-26:
- **Time to the first indexed event:** under a minute. We linked from 100 blocks back and ran one x402
  purchase. Its three mJPYC `Transfer`s came back from the saved queries within a minute.
- **Went well:**
  - the explorer lookup imported all four ABIs from their verified sources;
  - the Matsuri sample's add/subtract query format computed net balances unchanged;
  - the contract call API reads `decimals()` without signing anything.
- **Friction:** `POST /contracts/{label}` needs `bin`, although the API reference marks it optional. Without it
  the answer is a 400: `null value in column "bytecode" of relation "contracts" violates not-null constraint`.
  Sending `bin: ""` works; it is stored as `0x`.
- **Friction:** `GET /events` ignores its `tx_hash` filter: it answers `[]` for a transaction MultiBaas has
  indexed, so our settlement lookup reads a saved query instead. Event queries also return a `bytes32` as its
  bytes, `"[218, 200, …]"`, while `GET /events` returns hex.
- **Friction:** the free plan backfills 100 blocks and keeps events for 72 hours. History from before the link
  has to come from RPC logs, which is why `GET /payments` merges the two.
- **Top improvement:** make `bin` optional in practice, or document it as required. And let a plan backfill a
  contract once from its creation block.

## Deployed on Sepolia (all [Sourcify](https://sourcify.dev) exact matches)

| Contract | Address |
|---|---|
| PayeeRegistry | [`0x205c977cF1f4Ed42e51a48759550eF40160A6396`](https://repo.sourcify.dev/11155111/0x205c977cF1f4Ed42e51a48759550eF40160A6396) |
| PayeeResolver (`payee.eth`) | [`0x096ebC07eE87fbb19FF920a5c81b2Ad5c9104A1e`](https://repo.sourcify.dev/11155111/0x096ebC07eE87fbb19FF920a5c81b2Ad5c9104A1e) |
| AgentVault | [`0x87A798CD92dE1340B1b761dd45196AC82bEF793B`](https://repo.sourcify.dev/11155111/0x87A798CD92dE1340B1b761dd45196AC82bEF793B) |
| PayRouter | [`0xbA95BA5D4a2244cce46a76920f411B225116850C`](https://repo.sourcify.dev/11155111/0xbA95BA5D4a2244cce46a76920f411B225116850C) |
| MockJPYC (`mJPYC`) | [`0xEcA2B093682a46B14b143474d188A120bA2d0EC2`](https://repo.sourcify.dev/11155111/0xEcA2B093682a46B14b143474d188A120bA2d0EC2) |

Demo payees are fictional companies, marked as fictional in their on-chain evidence:
- `T2011001234567` 株式会社メイギ商事, the AP agent's supplier;
- `T8999900000001` 株式会社フジデータ, the x402 merchant.

Both were checked against the nationwide NTA data. See [`docs/runbook.md`](docs/runbook.md).

## Security

The core contracts (registry and officer quorum, resolver, vault, router, mock JPYC) went through three review rounds
by separate AI reviewers, with proof-of-concept exploits:
- 16 findings: 14 fixed, 2 documented as by design;
- round 3 mutation-tested every fix;
- 138 Foundry tests in all, including fuzzing of the core guarantee.

These reviews were AI-assisted, not a professional audit. Contract work after them (the ENS claim contracts
`ClaimedPayeeResolver` and `CompanyNamespace`, and a resolver change that hides a disputed payee's name) has tests
but no review round.

Roles, delays and the trust model are in [`contracts/README.md`](contracts/README.md). The agent is untrusted
by design and holds no key. The signer (`services/signer`) holds it, signs only `payInvoice`, and above ¥150,000 only
with a verified human's approval. The worst case is overpaying an approved vendor, up to that vendor's caps.
Governance is trusted too: a ruling on a dispute can move a payout without the company, after the same 72 hours in
public, and only governance can dismiss a queued ruling. The threat model, audit plan
and production roadmap are in [`docs/trust-and-compliance.md`](docs/trust-and-compliance.md).

## Run it locally

Needs Node ≥ 22, pnpm 11 and Foundry. The bench also needs Python with uv. Secrets live in a git-ignored
`.env` at the repo root; each package README lists the variables it reads.

```sh
pnpm install
cd contracts && forge test && cd ..                    # 138 tests (a fork test is skipped without an RPC)
pnpm -r test                                           # unit tests (vitest): agent, verifier, x402 guard, signer
pnpm --filter @meigi/verifier start                    # :8787 (needs the NTA index: services/verifier/scripts/build_nta_index.py)
scripts/ap-stack.sh                                    # the signer :8796 (the only key holder), then the agent :8788
pnpm --filter @meigi/agent multibaas:setup --awaji     # optional: index the Awaji contracts in Curvegrid MultiBaas
pnpm --filter @meigi/x402-demo start                   # :8790
pnpm --filter @meigi/web dev                           # :5173
pnpm dev:landing
```

Service ports, re-seeding and demo checks: [`docs/runbook.md`](docs/runbook.md). Public deploy:
[`scripts/deploy-demo.sh`](scripts/deploy-demo.sh).

## Docs

- [`docs/spec.md`](docs/spec.md): product and architecture.
- [`docs/runbook.md`](docs/runbook.md): live addresses, services, governance rules.
- [`docs/trust-and-compliance.md`](docs/trust-and-compliance.md): threat model, compliance posture, production
  roadmap.
- [`docs/world-agents-spec.md`](docs/world-agents-spec.md): human approval of held agent payments.
- [`AI_USAGE.md`](AI_USAGE.md) and [`docs/ai`](docs/ai): how AI was used, with every sub-agent brief.

MIT licensed.
