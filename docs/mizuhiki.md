# Mizuhiki / Awaji experiment (2026-09-26) — timeboxed, blocked on the faucet

A 45-minute experiment toward "Meigi also runs on the Japan chain". Contracts were **not** deployed: the PoW
faucet locked out further gas requests before the deployer address could be funded. Everything below is verified
directly against the chain or its docs; nothing here is deployed or claimed as working end to end.

## Chain

- RPC `https://rpc.awaji.mizuhiki.io` answers `eth_chainId` with `0x1961` = **6497**, matching Mizuhiki's docs.
- Explorer `https://awaji.blockscout.com` is live (HTTP 200).
- Native gas token: **MIZU**, 18 decimals.

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
| MJPY (Mizuhiki JPY, from x402 Contracts page) | `0x78f5f0Ac4EF201618b97638ded959b155c4f4B04` |

Uniswap V3 (Factory, SwapRouter02, QuoterV2, Universal Router) is also predeployed; not relevant to Meigi.

**Whether contract deployment itself is open or allow-listed was not established.** Mizuhiki's own docs don't say
either way, and we never got far enough to test it empirically (see below) — a generic CREATE2/ERC-2470/Safe
factory being predeployed is a *hint* that deployment is permissionless, not proof.

## MJPY: checked against our contracts, and it doesn't fit as-is

Read directly from chain (`cast call`, no gas needed):
- `name()` → "Mizuhiki JPY", `symbol()` → "MJPY", **`decimals()` → 6**.
- It's an upgradeable proxy (bytecode starts with the standard ERC-1967/UUPS selectors: `upgradeTo`,
  `upgradeToAndCall`, `implementation()`).
- `authorizationState(address,bytes32)` and `nonces(address)` both answered without reverting (clean ABI-decoded
  results), suggesting real EIP-3009 and EIP-2612 support behind the proxy, though this wasn't confirmed with an
  actual signed authorization.

**Decision: don't use it directly.** Our contracts (`AgentVault` caps, `PayRouter`, the seed script's mint/approve
amounts) hard-code 18-decimal atomic amounts throughout. MJPY's 6 decimals would silently break every one of those
by a factor of 10^12 unless every constant were rewritten and re-verified — not something to do for the first time
in a 45-minute experiment. If we come back to this, deploy our own `MockJPYC` (18 decimals) exactly as on Sepolia,
the same way `Deploy.s.sol` already does by default when `TOKEN_ADDRESS` is unset.

## The faucet, and where this stopped

The MIZU faucet (`docs.mizuhiki.io/en/core/faucet`) is a proof-of-work faucet (the open-source
[pk910/PoWFaucet](https://github.com/pk910/PoWFaucet)): enter an address, click "Start Mining", and a Web Worker
in the browser mines shares over a WebSocket while connected. It is **not** a one-shot API call — the reward
accumulates live in that browser tab, and a session lasts up to 12 hours server-side (`sessionTimeout: 43200`,
`powIdleTimeout: 1800`, both seconds, from `/api/getFaucetConfig`), with **only one concurrent session per IP**.

What happened: a first mining run (Playwright, headless) reached 0.108 MIZU (well above the 0.001 MIZU minimum
claim) after about two minutes, but the script closed the browser to inspect the result instead of claiming first.
The next attempt to start a new session failed:

```
POST /api/startSession → {"status":"failed","failedCode":"CONCURRENCY_LIMIT","failedReason":"Only 1 concurrent sessions allowed per IP"}
```

`getSession` needs a session id we never captured (we only ever had the address); no `closeSession`/`stopSession`
endpoint exists. The idle timeout is 30 minutes, well past this task's remaining budget, so this was the stopping
point: the deployer address (`DEPLOYER_ADDRESS` in `.env`) never received MIZU, and nothing was deployed to 6497.

**To actually get gas next time:** keep the *same* browser tab open from "Start Mining" straight through to
clicking "Stop Mining & Claim Rewards" — don't close it to check progress in between. The claim itself is an
on-chain transaction the faucet submits, so it should show up on the explorer once clicked.

## Not attempted (blocked by the above)

- Deploying a trivial contract to check whether deploys are open.
- `Deploy.s.sol` against chain 6497 / `contracts/deployments/6497.json`.
- Registering 株式会社メイギ商事 (T2011001234567) with the fixture officer/evidence.
- A real payment through `PayRouter` or `AgentVault`, and a simulated or real `PayeeMismatch` refusal.

## If picking this back up

1. Mine MIZU for the deployer address in one continuous browser session; claim before doing anything else.
2. `forge script script/Deploy.s.sol --rpc-url https://rpc.awaji.mizuhiki.io --broadcast` from `contracts/`, same
   env as Sepolia (`DEPLOYER_PRIVATE_KEY`, `ATTESTER_ADDRESS`, `AGENT_ADDRESS`, `VAULT_OWNER_ADDRESS`), *without*
   `TOKEN_ADDRESS` set, so it deploys its own MockJPYC rather than the incompatible 6-decimal MJPY. If the very
   first transaction (`PayeeRegistry`'s constructor) is rejected by an allowlist, that answers the open-question
   above — stop and report the chain's exact error, per the original brief.
3. Register 株式会社メイギ商事 (T2011001234567) the same way `contracts/script/seed-demo.sh` does (fixture officer
   `keccak("meigi-demo-fixture-officer")`, fictional evidence), then one real payment and one `PayeeMismatch`
   refusal (`cast call`, simulated, costs no gas).
