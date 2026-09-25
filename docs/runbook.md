# Runbook

Everything runs from the repo root, with secrets in a git-ignored `.env` (never commit it).

## Live deployment (Sepolia)

| Contract | Address |
|---|---|
| PayeeRegistry | `0xB2D61a2d1EF2C340F8b4cf9ec90E1eDCB08a6e84` (from block 11780968) |
| PayeeResolver (parent `payee.eth`) | `0xEC8C23682Df12A0422d8a656F80c51858E6fEd92` |
| PayRouter | `0x1fdf6b12f9734291d179C842074E34563b15fF1E` |
| MockJPYC (`mJPYC`) | `0xEcA2B093682a46B14b143474d188A120bA2d0EC2` |
| AgentVault | `0x20554C36fe044d4725Fd1C9798fDA69e9a49f74D` |

All are verified on Sourcify. Timelocks: 72h for payout changes, rotations and dispute resolutions; 1h for new vendors.

Demo fixtures, fictional companies marked as such in their on-chain evidence:
- `T2011001234567` 株式会社メイギ商事: the AP-agent vendor. The vault approves it with caps of ¥500k per invoice and ¥1M per 30 days.
- `T2010401000001` 株式会社フジデータ: the x402 data merchant.

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

## Demo checks (five minutes before judging)

1. `curl localhost:8787/payees/T2011001234567`: the fixture vendor is active.
2. `curl localhost:8790/demo/compromised`: refused before signing (`payto_mismatch`).
3. In the AP console, paste the bank-change invoice. The agent proposes paying; "pay anyway" reverts with
   `PayeeMismatch` and names 株式会社メイギ商事.
4. The registry explorer shows `t2011001234567.payee.eth` → `0x9B4f…47e4`.
