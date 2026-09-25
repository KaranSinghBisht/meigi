# Runbook

Everything runs from the repo root, with secrets in a git-ignored `.env` (never commit it).

## Live deployment (Sepolia)

| Contract | Address |
|---|---|
| PayeeRegistry | `0x205c977cF1f4Ed42e51a48759550eF40160A6396` (from block 11781105) |
| PayeeResolver (parent `payee.eth`) | `0xe3Fa4DC8C2920CC0a682781d8a51E4bbCaF025dA` |
| PayRouter | `0xbA95BA5D4a2244cce46a76920f411B225116850C` |
| MockJPYC (`mJPYC`) | `0xEcA2B093682a46B14b143474d188A120bA2d0EC2` |
| AgentVault | `0x87A798CD92dE1340B1b761dd45196AC82bEF793B` |

This is deployment v2, after two security-review rounds. v1 (`deployments/11155111-v1.json`) is retired.
All are verified on Sourcify. Timelocks: 72h for payout changes, rotations and dispute resolutions; 1h for new vendors.

Demo fixtures, fictional companies marked as such in their on-chain evidence:
- `T2011001234567` 株式会社メイギ商事: the AP-agent vendor. The vault approves it with caps of ¥500k per invoice and ¥1M per 30 days.
- `T2010401000001` 株式会社フジデータ: the x402 data merchant.

## ENS

`payee.eth` is registered on both Sepolia ENSv2 deployments, and both point at the v2 PayeeResolver:
- **ENSv2 Beta** (the official deployment; viem's default Sepolia Universal Resolver `0xeEeE…EeEe`). Any ENS
  client resolves `t2011001234567.payee.eth` with no configuration.
- **Hackathon deployment** (Universal Resolver proxy `0xd26f2040D083Af1cD2962ba303F4BEa0c4faf142`).

Check: `EXPECT_ADDR=0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4 contracts/script/ens/ens.sh check`
(set `ENS_DEPLOYMENT=beta` for the Beta). Scripts and details: `contracts/script/ens/README.md`.

## Services

| Port | Service | Start |
|---|---|---|
| 8787 | verifier (attester) | `pnpm --filter @meigi/verifier start` |
| 8788 | AP agent | `pnpm --filter @meigi/agent start` |
| 8790 | x402 demo (merchant + facilitator + guarded buyer) | `pnpm --filter @meigi/x402-demo start` |
| 8009 | Kev System-1 model (local) | see `bench/README.md` |
| 5173 | web app | `pnpm --filter @meigi/web dev` |
| — | landing | `pnpm dev:landing` |

The AI proxy (Workers AI chat + Jev) is deployed at `https://meigi-ai-proxy.karanbishttt.workers.dev`
(`workers/ai-proxy`) and needs `AI_PROXY_TOKEN`.

## Re-seeding

```sh
bash contracts/script/seed-demo.sh        # fixture vendor, vault funding, vendor approval (idempotent registration)
```

`seed-demo.sh` passes testnet keys to `cast` on the command line, where local `ps` can see them. Run it only on
a trusted single-user machine; the ENS scripts and forge scripts read keys from the environment instead.

## Demo checks (five minutes before judging)

1. `curl localhost:8787/payees/T2011001234567`: the fixture vendor is active.
2. `curl localhost:8790/demo/compromised`: refused before signing (`payto_mismatch`).
3. In the AP console, paste the bank-change invoice. The agent proposes paying; "pay anyway" reverts with
   `PayeeMismatch` and names 株式会社メイギ商事.
4. The registry explorer shows `t2011001234567.payee.eth` → `0x9B4f…47e4`.
