# Mizuhiki / Awaji: Meigi is live (2026-09-26)

Meigi on Mizuhiki's Awaji testnet (chain 6497): `PayeeRegistry` and the token-agnostic `PayRouter`, deployed,
linked in MultiBaas, a real vendor registered, paid in real MJPY and real MUSD, and a swapped-payout payment
refused. Everything below is independently verified against the chain itself, not just trusted from a script's
own return value or a `pay()` call's success.

## Chain

- RPC `https://rpc.awaji.mizuhiki.io` answers `eth_chainId` with `0x1961` = **6497**, matching Mizuhiki's docs.
- Explorer `https://awaji.blockscout.com` is live (HTTP 200).
- Native gas token: **MIZU**, 18 decimals. The real minimum priority fee the chain accepts is **30 gwei** — forge's
  own gas-price auto-estimate against this RPC comes back at ~0.000000015 gwei and gets rejected outright at
  broadcast time, so `--gas-price`/`--priority-gas-price` must be set explicitly (we use 33/31 gwei).

## Predeployed contracts (docs.mizuhiki.io/en/core/predeployed-contracts)

| Contract | Address |
|---|---|
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Permit2 | `0x000000000022d473030f116ddee9f6b43ac78ba3` |
| Create2 Factory | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |
| ERC-2470 Singleton Factory | `0xce0042B868300000d44A59004Da54A005ffdcf9f` |
| Safe Deployer | `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` |
| Wrapped MIZU (WMIZU) | `0x7d0DB3d6eA9687A385069BA85f7D5DBA0BD656B8` |
| Wrapped MIZU 10 (WMIZU10) | `0x4A6b454B4A44d7F2ab2F4f5f2DF69f5cba146bA3` |
| MUSD (Mock USD) | `0xb9C49B527294E8472eD48B800E81b5FA69D0f72E` |
| MJPY (Mizuhiki JPY) | `0x78f5f0Ac4EF201618b97638ded959b155c4f4B04` |

Uniswap V3 (Factory, SwapRouter02, QuoterV2, Universal Router) is also predeployed; not relevant to Meigi.

Both MUSD and MJPY have their own PoW-faucet-adjacent claim contracts (a plain, callable function, not a
browser-only flow): `0x316BEF37aadf9Ab3f0f455588dE45443C91188d6` (MUSD, 10 per claim) and
`0xaD93649dbDe82ed1219Ee7B64C4C8FEE9dA520C0` (MJPY, 1,000 per claim), both `sendTokens(address)` at selector
`0x837197b2` (read from their bytecode; `request(address)` would be `0x27c78c42`, which neither has), 24h cooldown
per recipient (`lastClaim(address)`, `COOLDOWN()` = 86,400). Anyone can pay the gas for a claim. Both tokens are
real ERC-20s, 6 decimals.

## Deploy: registry + router only, by design

Only `PayeeRegistry` (to register vendors) and the token-agnostic `PayRouter` (to pay them) are deployed here —
not `PayeeResolver` (ENS lives on Sepolia, not Awaji), not `AgentVault` or `MockJPYC` (the agent demo runs on
Sepolia; Awaji pays in Mizuhiki's own real MJPY/MUSD instead). Script: `contracts/script/DeployAwaji.s.sol`. One
key is both governance and attester, to keep the funded-key count at one.

**Deployed 2026-09-26, 15:31 JST, and verified live:**

| | Address | Tx | Block |
|---|---|---|---|
| PayeeRegistry | `0x4dbF8b5C3da46996C156AC3d17B16a230387b7C4` | [`0x7dc41c16…19ab8d`](https://awaji.blockscout.com/tx/0x7dc41c161644be5fc1899e3cb5bade43f8e686c06de14da07a61aaa00019ab8d) | 2387847 |
| setAttester(deployer, true) | — | [`0x066c3540…e0f2db8`](https://awaji.blockscout.com/tx/0x066c3540eccb72a419d169df3562676abc0778ceb0d8449b0fb34be61e0f2db8) | 2387848 |
| PayRouter | `0x589E7f274Cd5E87d71443993AC30b39E2E70659e` | [`0xedfd9d9d…87186ccf8`](https://awaji.blockscout.com/tx/0xedfd9d9d2f7592adf05d3b1a0d3f412d14f8e0a657f8efd65b5af7b87186ccf8) | 2387849 |

All three receipts read status 1 directly from the broadcast record and from the chain. Independently confirmed
with fresh `cast call`s, not just trusted from the deploy script:
- `PayeeRegistry.owner()` → the deployer.
- `PayeeRegistry.changeDelay()` → `259200` (72h, same as Sepolia's default).
- `PayeeRegistry.isAttester(deployer)` → `true`.
- `PayRouter.pay(...)` with a nonexistent T-number reverts with a real custom-error selector (not empty-code
  "no such contract"), confirming it's genuinely deployed and executing logic.

`contracts/deployments/6497.json` holds these addresses plus `token: MJPY`'s real address (recorded for
MultiBaas's linker; MJPY itself isn't deployed by this script, it's Mizuhiki's own predeployed token).


## Registered and paid, real, verified

株式会社メイギ商事 (T2011001234567), registered by the attester with the same fixture officer/evidence
`contracts/script/seed-demo.sh` uses on Sepolia:

| | Tx | Block |
|---|---|---|
| `register(...)` | [`0x7bea88a2…259207572`](https://awaji.blockscout.com/tx/0x7bea88a2d567fe46d955f3aab0dfb29467ace84223cf033db9446d9259207572) | — |
| approve MJPY → router | [`0xa57f31ea…354ad7519`](https://awaji.blockscout.com/tx/0xa57f31ea4a6b12acc037c8e78517637579b49e5456f86ff58603839354ad7519) | — |
| **pay 1,000 MJPY (¥1,000)** | [`0x294d6b5b…3fa280ca3`](https://awaji.blockscout.com/tx/0x294d6b5b697620dbee17ef3880eee9ad58dbde2157e5b61d17908b63fa280ca3) | — |
| approve MUSD → router | [`0x6b41e521…ed5f89012`](https://awaji.blockscout.com/tx/0x6b41e521f3cad0333479a05f96abbf1d863502bad9e2cefa1113d75ed5f89012) | — |
| **pay 5 MUSD ($5)** | [`0xf87e428b…674d8c446a`](https://awaji.blockscout.com/tx/0xf87e428b3d1f3f6cfbe44a39d80e01acb3ac3952a685a7fbb5c799674d8c446a) | — |

All five receipts status 1. Confirmed the registered payout actually received both: `balanceOf` reads
1,000,000,000 (1,000 MJPY, 6 decimals) and 5,000,000 (5 MUSD, 6 decimals) directly from each token contract, not
just trusted from the `pay()` return value.

**One refused payment, real revert (no gas — `cast call`, not `cast send`):** the same `pay()` with the payout
swapped to the demo scammer address (`DEMO_SCAMMER`) reverts `PayeeMismatch(uint64,address,address)` (selector
`0xc6652bcc`, confirmed against `cast sig`), decoded args showing the scammer address and the real registered
payout exactly as expected. Nothing was broadcast.

**MultiBaas:** linked by apagent from block 2387847 (the deploy's first block), about 2 minutes after the real
deploy — `meigi_registry`, `meigi_router`, `meigi_mjpy` aliases and a saved query for the router's `Paid` event
filtered to MJPY.

## How this got funded

The PoW faucet (`docs.mizuhiki.io/en/core/faucet`, the open-source
[pk910/PoWFaucet](https://github.com/pk910/PoWFaucet)) mines MIZU live in a browser tab over a WebSocket, one
session per IP. An earlier attempt lost its session by closing the browser before claiming (`CONCURRENCY_LIMIT`
on the next attempt, and no way to resume a session without its id). The team ultimately funded the deployer
directly rather than continuing to fight the faucet.

## x402 on Mizuhiki's own rail: paid in MJPY, refused before signing

The x402 demo (`services/x402-demo`) runs on Awaji with `X402_CHAIN=awaji`: the same merchant, facilitator and
guarded buyer as on Sepolia, set up as Mizuhiki's x402 quickstart (`docs.mizuhiki.io/en/core/x402-quickstart`)
describes it: network `eip155:6497`, MJPY with EIP-712 domain "Mizuhiki JPY" v2 and 6 decimals, the `exact`
scheme. What we checked on-chain before paying anything:
- MJPY's `name()` and `version()` read "Mizuhiki JPY" and "2". It is a FiatToken-style proxy whose implementation
  (`0x934d8a57…0d88`) has both `transferWithAuthorization` variants, so `exact` settles by EIP-3009. Mizuhiki's
  Permit2 proxies (`x402ExactPermit2Proxy` `0x402085c2…0001` has code) aren't needed for MJPY.
- **Mizuhiki's hosted facilitator was down.** `https://x402-production-6134.up.railway.app`, the URL in their
  quickstart, answered HTTP 404 `"Application not found"` on `/` and `/supported` at 06:54:57 and 07:20:24 UTC
  (15:54 and 16:20 JST). So **our own facilitator settled**: the demo's in-process one, the same code as on Sepolia,
  paying the gas from its own key. `AWAJI_FACILITATOR_URL` switches to theirs once it's back; that path is untested.
- Awaji has no ENS, so the merchant declares only its T-number (`meigiPayeeDeclaration(t, { ens: false })`), and
  the buyer's guard checks `payTo` against the Awaji registry alone.

株式会社ミナトGPUクラウド (T6999900000003), the demo's GPU merchant, is registered here by
`contracts/script/seed-awaji.sh`, with the same fixture officer and evidence as Sepolia. Its payout is a key we
hold, in the git-ignored `.env.awaji`. Everything was rehearsed first on an anvil fork of Awaji
(`pnpm --filter @meigi/x402-demo e2e:awaji-fork`, 14 checks), then run live once:

| | Tx | Block | Checked on-chain |
|---|---|---|---|
| register 株式会社ミナトGPUクラウド | [`0x2c19e952…63fe30c`](https://awaji.blockscout.com/tx/0x2c19e952dbf9ab86e56a2859cfb7c4da7f0fb9645cefbccbf6de4832d63fe30c) | 2388333 | `payeeOf`: the exact name, payout `0xA3657Ad49638342a477B601E2c19417E9206776e`, fixture evidence `0xf8b96e6b…48ae`, status 1 |
| MJPY faucet → the buyer | [`0x0dbfb2e6…97f802e9`](https://awaji.blockscout.com/tx/0x0dbfb2e6b2a7f4a8b530af3ead5863a2cc38ad60dde7dea1be52304897f802e9) | 2388337 | buyer holds 1,000 MJPY and no MIZU (it only signs) |
| 0.01 MIZU → our facilitator | [`0xab1501ce…4c131bd0c3`](https://awaji.blockscout.com/tx/0xab1501ce142d384ad293b7955d4f4ccb16c366526fa802309583aa4c131bd0c3) | 2388339 | for settlement gas |
| **x402: 1 GPU-minute, 15 MJPY, settled** | [`0x779c3619…0525959b`](https://awaji.blockscout.com/tx/0x779c3619797c1ef48a25aceba107f24f47cf0db4f172ebb2d8b9277b0525959b) | 2388346 | our facilitator → MJPY `transferWithAuthorization` (`0xe3ee160e`); logs `AuthorizationUsed(buyer)` and `Transfer(buyer → 0xA365…776e, 15,000,000)`; after: buyer 985, payout 15, swapped address 0 MJPY |
| **x402: the compromised inference mirror, refused** | none | — | `payTo 0xdCa5…6d5b is not 株式会社ミナトGPUクラウド (T6999900000003)'s registered payout 0xA365…776e`: refused before signing, so nothing was signed or sent |

Intercepta screened both `payTo`s during the run (toxicScore 0 each); the refusal is the registry's. The
registration and the payment are both in MultiBaas: `meigi_payees_registered` returns Minato at block 2388333,
and `meigi_mjpy_received` shows 15,000,000 at `0xa365…776e`. Cost: 0.0219 MIZU from the deployer for the three
setup txs, and 0.0032 MIZU of the facilitator's for the settlement (102,322 gas at 31 gwei).

## Limits, plainly

- **No AgentVault on Awaji.** The AP agent's vault (owner-approved vendors, per-vendor caps) and its human-approval
  flow run on Sepolia only. On Awaji, payments go through the registry-checked `PayRouter` or x402.
- **No ENS on Awaji.** The `t<T-number>.payee.eth` cross-check exists only on Sepolia; here the registry is the
  only check.
- **Fixtures only.** Both Awaji payees are fictional (evidence on-chain says so), registered directly by our
  attester: no NTA match, DNS proof or World ID officer enrollment happens on Awaji.
- **Our facilitator, not Mizuhiki's.** Theirs was down (above), so settlement went through ours. The switch to
  theirs is one setting, but untested.
