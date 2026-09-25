# Meigi app (`@meigi/web`)

The app behind the landing page's "enter": registry explorer, business registration, company changes, the AP
agent console and the x402 guard demo. Vite + React 19 + TypeScript, viem on Sepolia, World ID 4.0 (IDKit).

| Route | What | Talks to |
|---|---|---|
| `/` | Home: live fixture payee and the four flows | Sepolia |
| `/agent` | AP console: analyse an invoice, pay or force-pay, see the chain refuse | agent, Sepolia |
| `/registry/:tNumber?` | Payee card, pending-change countdowns, ENS check, live event feed | Sepolia |
| `/register` | NTA match → domain proof (personal_sign) → World ID officers → submit | verifier, wallet |
| `/change/:tNumber?` | Approval request → officers prove their World ID session → controller queues it | verifier, wallet |
| `/x402` | Guarded buyer vs honest / compromised merchant | x402 demo |

## Run

```sh
pnpm install --filter "@meigi/web..."
pnpm --filter @meigi/web dev        # http://localhost:5173
pnpm --filter @meigi/web build      # type-checks, then builds to dist/
pnpm --filter @meigi/web preview    # http://localhost:4173
```

The services allow `http://localhost:5173` and `:4173` by default (`APP_ORIGINS`). Start them from the repo root:
`pnpm --filter @meigi/verifier start`, `pnpm --filter @meigi/agent start`, `pnpm --filter @meigi/x402-demo start`.
Every page degrades to a clear "not reachable" state when its service is down; the registry needs only the RPC.

Wallet: any injected EIP-1193 wallet (`window.ethereum`: Brave Wallet, MetaMask) on Sepolia.

## Configuration

See `.env.example`. Contract addresses default to `contracts/deployments/11155111.json`, so a redeploy needs no
env change. All `VITE_` values are public; never put secrets in them.

## Screenshots

```sh
pnpm --filter @meigi/web build && pnpm --filter @meigi/web shots   # docs/web/*.png, 1440 × 900
```

`registry-pending.png` rewrites `payeeOf` answers in flight (the live chain has no queued change) to show the
countdown banner and that the queued address stays hidden. The agent, change-approvals and x402 shots need their
services running.
