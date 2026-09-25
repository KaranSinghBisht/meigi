# Meigi app (`@meigi/web`)

The app behind the landing page's "enter": registry explorer, business registration, company changes, the AP
agent console and the x402 guard demo. Vite + React 19 + TypeScript, viem on Sepolia, World ID 4.0 (IDKit).

| Route | What | Talks to |
|---|---|---|
| `/` | Home: live fixture payee and the four flows | Sepolia |
| `/agent` | AP console: analyse an invoice, pay, have a verified human approve a held one (World ID for Agents), or force-pay to see the chain refuse | agent, Sepolia |
| `/registry/:tNumber?` | Payee card, pending-change countdowns, ENS check, live event feed | Sepolia |
| `/register` | NTA match → domain proof (personal_sign) → World ID officers → submit | verifier, wallet |
| `/change/:tNumber?` | Approval request → officers prove their World ID session → controller queues it | verifier, wallet |
| `/x402` | Guarded buyer vs honest / compromised merchant, and Intercepta-screened merchants with no Meigi record | x402 demo |

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

## Hosted build (public demo link)

```sh
VITE_HOSTED=1 VITE_LANDING_URL=https://<landing host>/ pnpm --filter @meigi/web build
```

The app is its own static site at the root of its host. `wrangler.jsonc` serves `dist/` as Cloudflare static
assets with single-page-application fallback, so deep links like `/registry/T…` work; `scripts/deploy-demo.sh` at
the repo root builds it this way, checks the bundle for secrets and deploys.

- `VITE_HOSTED=1`: the registry explorer, ENS check and event feed stay fully live (public RPC only). Register,
  change, the agent console and x402 need the verifier, agent or x402 demo, which hold keys and only run on the
  demo machine. Each of those steps first checks whether its service is reachable from the page; if not, it shows
  a calm "runs on the Meigi demo machine" panel, and the agent and x402 pages replay recorded real runs (clearly
  labelled, with Sepolia links). A public page never probes a loopback service URL, because browsers would prompt
  visitors for local-network access.
- Every `VITE_` value is public; the bundle holds no keys.

## Screenshots

```sh
pnpm --filter @meigi/web build && pnpm --filter @meigi/web shots   # docs/web/*.png, 1440 × 900
```

`registry-pending.png` rewrites `payeeOf` answers in flight (the live chain has no queued change) to show the
countdown banner and that the queued address isn't shown. The agent, change-approvals and x402 shots need their
services running. `SHOTS_HOSTED=1 SHOTS_PORT=4180` captures a hosted build as `hosted-*.png`.
`x402-unverified.png` buys from the flagged merchant, which is refused before signing. `SHOTS_HONEST=1` adds the
honest and the clean unverified purchases, which settle real Sepolia payments (the unverified one once Intercepta is
configured); no shot ever clicks Pay on an auto-cleared invoice, which would spend the demo invoice.
