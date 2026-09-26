# x402 demo: a small agentic marketplace

One process, three roles, built on the official x402 v2 packages (`@x402/hono`, `@x402/fetch`, `@x402/evm`):

- **Merchants**: two realistic, fictional companies (registry office 9999; see `docs/runbook.md`), each priced in
  (mock) JPYC on Sepolia and each with a compromised variant (the server swapped `payTo`; an attacker can edit a
  web server, not the company's registry entry or its ENS name):
  - **Minato GPU Cloud** (`T6999900000003`): `POST /compute/minato/inference` (30 mJPYC), `POST
    /compute/minato/gpu-minute` (15 mJPYC), and the compromised `POST /compute/minato/inference/compromised`.
  - **Fuji Data** (`T8999900000001`): `GET /data/fuji/dataset/:slice` (20 mJPYC, an invoice-OCR training-data
    slice), and the compromised `GET /data/fuji/dataset/:slice/compromised`.
  - **An undeclared merchant**, like most of the web today: `GET /web/scrape/undeclared` (10 mJPYC, clean payTo)
    and `/web/scrape/undeclared-flagged` (the OFAC-listed Ronin bridge exploiter address). No T-number to check,
    so a buyer can only judge these by screening `payTo`, and only for small amounts.
- **Facilitator**: self-hosted and in-process. It verifies EIP-3009 authorizations and settles them with its own
  key. The public x402.org facilitator only serves Base Sepolia.
- **Buyer agent** (`buyer.ts`): `@x402/fetch` with `@meigi/x402-guard` registered — the registry and the
  merchant's declared ENS name must independently agree with `payTo`, and a merchant that declares nothing is
  paid at most 50 mJPYC, and only after a live Intercepta screen of `payTo` comes back clean (refused without an
  `INTERCEPTA_API_KEY`, or when screening fails).
- **Research-agent scenario** (`scenario.ts`): a buying agent that needs 2 GPU-minutes and a dataset slice for a
  job, and also tries a compromised look-alike and a cheap undeclared source it found along the way. Logs each
  step: the 402 it received, the declared company, what ENS and the registry each say, screening, then signed or
  refused and why, then settled with the tx.

## Run

```sh
pnpm --filter @meigi/x402-demo start                    # reads ../../.env, listens on :8790
pnpm --filter @meigi/x402-demo research-agent            # the scenario above, human-readable step log
pnpm --filter @meigi/x402-demo research-agent -- --json  # the same, as ScenarioResult JSON
curl -X POST localhost:8790/scenario/research-agent      # the scenario over HTTP, for the web page
```

Where the checks are: `packages/x402-guard/src/check.ts` (`checkPayee` for declared merchants, `checkUndeclared`
for undeclared ones) and `packages/x402-guard/src/ens.ts` (the ENS resolver). Both run in x402's
`onBeforePaymentCreation` hook, before anything is signed.

Env: `SEPOLIA_RPC_URL`, `REGISTRY_ADDRESS`, `TOKEN_ADDRESS`, `DEMO_MERCHANT_T_NUMBER`, `DEMO_MERCHANT_PAYOUT`,
`DEMO_MINATO_T_NUMBER`, `DEMO_MINATO_PAYOUT`, `DEMO_SCAMMER`, `DEMO_BUYER_PRIVATE_KEY` (holds mJPYC),
`FACILITATOR_PRIVATE_KEY` (holds Sepolia ETH), and optionally `INTERCEPTA_API_KEY`, `DEMO_UNVERIFIED_PAYTO` and
`DEMO_FLAGGED_PAYTO`.

Verified live (2026-09-26), one research-agent run: 2 GPU-minutes and a dataset slice settled (txs
`0x24b128e8301d079fa0aa7717406cd968f6fe64c3b7f2d613b1dfc8d61103b3f1`,
`0xce9c6cf82c02403711036b488c99cf80c6cab24731f4b60dcde5eea661572a34`,
`0x48d3d33aa61cb3b9c2c2eb6e474fc99cf3260d5454505ab142f3375a0774e3d3`); the compromised GPU mirror was refused
("t6999900000003.payee.eth resolves to the registered payout 0x4d6D…fD30, but payTo asks for 0xdCa5…6d5b
instead"); the undeclared scrape was refused (`no_declaration`, no Intercepta key configured).

## Awaji mode: x402 on Mizuhiki's own rail

`X402_CHAIN=awaji` runs the same code on Mizuhiki's Awaji testnet (chain 6497), following Mizuhiki's x402 quickstart
(docs.mizuhiki.io/en/core/x402-quickstart): network `eip155:6497`, their MJPY (`0x78f5…4B04`, 6 decimals, EIP-712
domain "Mizuhiki JPY" v2) and the `exact` scheme, settled by EIP-3009 `transferWithAuthorization`.
- **The registry is the only check.** ENS isn't on Awaji, so Minato declares only its T-number, and the guard
  compares `payTo` with Meigi's Awaji registry (`contracts/deployments/6497.json`).
- **Only Minato GPU Cloud is served,** the one merchant registered there (`contracts/script/seed-awaji.sh`). The
  research agent buys one GPU-minute (15 MJPY) and tries the compromised inference mirror.
- **Settlement.** `AWAJI_FACILITATOR_URL` points the merchant at Mizuhiki's hosted facilitator. It was down on
  2026-09-26 (HTTP 404 "Application not found"), so unset it: the in-process facilitator settles on Awaji with
  `FACILITATOR_PRIVATE_KEY`, which needs a little MIZU for gas. The buyer needs none: it only signs.

```sh
pnpm --filter @meigi/x402-demo e2e:awaji-fork               # the whole flow on an anvil fork of Awaji: spends nothing
X402_DEMO_PORT=8792 pnpm --filter @meigi/x402-demo start:awaji
X402_DEMO_PORT=8792 pnpm --filter @meigi/x402-demo research-agent:awaji
```

Awaji env: `AWAJI_MINATO_PAYOUT` (Minato's registered Awaji payout), and optionally `AWAJI_RPC_URL`,
`AWAJI_REGISTRY_ADDRESS`, `AWAJI_TOKEN_ADDRESS` (defaults: Mizuhiki's RPC, our registry, MJPY) and
`AWAJI_FACILITATOR_URL`.
