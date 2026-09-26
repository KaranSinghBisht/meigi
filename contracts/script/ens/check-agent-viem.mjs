// Resolves the AP agent's ENS name with stock viem (no overrides: on Sepolia that is the ENSv2 Beta) and prints one
// JSON line with its address and its ENSIP-26 and Meigi text records. Run it like check-viem.mjs:
//   (cd apps/landing && node --input-type=module) < contracts/script/ens/check-agent-viem.mjs
// Env: RPC_URL, ENS_NAME (ap.meigi.eth).
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { normalize } from 'viem/ens'

const KEYS = ['agent-context', 'agent-endpoint[web]', 'agent-status', 'meigi.vault', 'meigi.registry', 'meigi.payees']

if (!process.env.RPC_URL) throw new Error('Set RPC_URL (viem would otherwise fall back to a public third-party RPC)')
const name = normalize(process.env.ENS_NAME || 'ap.meigi.eth')
const client = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) })

const [address, ...values] = await Promise.all([
  client.getEnsAddress({ name }),
  ...KEYS.map((key) => client.getEnsText({ name, key })),
])
const texts = Object.fromEntries(KEYS.map((key, i) => [key, values[i]]))
const universalResolver = `viem default ${sepolia.contracts.ensUniversalResolver.address}`
process.stdout.write(`${JSON.stringify({ name, universalResolver, address, texts })}\n`)
