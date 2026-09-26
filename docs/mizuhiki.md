# Mizuhiki / Awaji: Meigi's minimal deploy (2026-09-26)

Meigi on Mizuhiki's Awaji testnet (chain 6497): `PayeeRegistry` and the token-agnostic `PayRouter`, deployed and
verified for real. Registration and payments are the next step (see "Not yet done" below) — everything in this
file above that line is independently verified against the chain itself, not just the deploy script's own claim.

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
`0xaD93649dbDe82ed1219Ee7B64C4C8FEE9dA520C0` (MJPY, 1,000 per claim), both `request(address)` at selector
`0x837197b2`, 24h cooldown per address per token. Both are real ERC-20s, 6 decimals.

## Deploy: registry + router only, by design

Only `PayeeRegistry` (to register vendors) and the token-agnostic `PayRouter` (to pay them) are deployed here —
not `PayeeResolver` (ENS lives on Sepolia, not Awaji), not `AgentVault` or `MockJPYC` (the agent demo runs on
Sepolia; Awaji pays in Mizuhiki's own real MJPY/MUSD instead). Script: `contracts/script/DeployAwaji.s.sol`. One
key is both governance and attester, to keep the funded-key count at one.

**Deployed and verified live:**

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

**One wrinkle, for the record:** forge initially reported "max priority fee per gas higher than max fee per gas"
on this broadcast and it looked like a clean failure (balance unchanged in an immediate check). It wasn't — all
three transactions had actually been mined; the error appears to have come from a spurious retry of an
already-included transaction. Caught by checking the broadcast record's receipts directly and independently
verifying on-chain, rather than trusting the CLI's exit status alone.

## Not yet done

- Registering 株式会社メイギ商事 (T2011001234567) with the fixture officer/evidence, the same way
  `contracts/script/seed-demo.sh` does on Sepolia.
- One real payment through `PayRouter`, in real MJPY and real MUSD (claimed from the faucet contracts above).
- One refused payment (`PayeeMismatch`), simulated via `cast call` — costs no gas.
- MultiBaas linking (apagent) — in progress as of this writing, coordinated separately given the free plan's
  ~100-block backfill window.

## How this got funded

The PoW faucet (`docs.mizuhiki.io/en/core/faucet`, the open-source
[pk910/PoWFaucet](https://github.com/pk910/PoWFaucet)) mines MIZU live in a browser tab over a WebSocket, one
session per IP. An earlier attempt lost its session by closing the browser before claiming (`CONCURRENCY_LIMIT`
on the next attempt, and no way to resume a session without its id). The team ultimately funded the deployer
directly rather than continuing to fight the faucet.
