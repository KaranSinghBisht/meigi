# x402 demo: a compromised merchant can't redirect an agent's payment

One process, three roles, built on the official x402 v2 packages (`@x402/hono`, `@x402/fetch`, `@x402/evm`):

- **Merchant**: a JPY/USD data API behind an x402 paywall, priced in (mock) JPYC on Sepolia. Its 402 response
  declares `extensions["meigi-payee"] = { tNumber: "T8999900000001" }`. `/merchant/compromised/fx` models a
  hacked server that swapped `payTo`. An attacker can edit a web server, not the company's registry entry.
- **Facilitator**: self-hosted and in-process. It verifies EIP-3009 authorizations and settles them with its
  own key. The public x402.org facilitator only serves Base Sepolia.
- **Buyer agent**: `@x402/fetch` with `@meigi/x402-guard` registered. The guard refuses to sign unless
  `payTo` is the declared company's registered payout, and optionally screens it with Intercepta.

## Run

```sh
pnpm --filter @meigi/x402-demo start          # reads ../../.env, listens on :8790
curl localhost:8790/demo/honest               # guard ok → signed → settled on Sepolia
curl localhost:8790/demo/compromised          # guard aborts before signing: payTo isn't the registered payout
```

Env: `SEPOLIA_RPC_URL`, `REGISTRY_ADDRESS`, `TOKEN_ADDRESS`, `DEMO_MERCHANT_T_NUMBER`, `DEMO_MERCHANT_PAYOUT`,
`DEMO_SCAMMER`, `DEMO_BUYER_PRIVATE_KEY` (holds mJPYC), `FACILITATOR_PRIVATE_KEY` (holds Sepolia ETH), and
optionally `INTERCEPTA_API_KEY`.

Verified live (2026-09-26): an honest purchase settled in
`0xf3c298960b9abac5466f4aa6e59f9a9ba4b73de703df3468d72f18049077b0df`. The compromised purchase was refused
with "payTo 0xdCa5…6d5b is not 株式会社フジデータ (T8999900000001)'s registered payout 0x0C1d…578D".
The merchant `T8999900000001` is a fictional fixture, marked as such in its on-chain evidence. Registry office
9999 doesn't exist, so no real company can hold this number.
