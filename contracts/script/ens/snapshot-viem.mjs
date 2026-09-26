// A byte-for-byte snapshot of Meigi's ENS names with stock viem (Sepolia, the Beta through viem's default
// UniversalResolver): each name's resolver, address and every text record Meigi's resolvers answer. Diff two runs to
// prove a change touched nothing else. One JSON line per name. Run it like check-viem.mjs:
//   (cd apps/landing && node --input-type=module) < contracts/script/ens/snapshot-viem.mjs
// Env: RPC_URL, NAMES (comma-separated; default: the reference names).
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { normalize } from 'viem/ens'

if (!process.env.RPC_URL) throw new Error('Set RPC_URL (viem would otherwise fall back to a public third-party RPC)')
const DEFAULT_NAMES = [
  't2011001234567.payee.eth',
  't8999900000001.payee.eth',
  't6999900000003.payee.eth',
  't3999905000001.payee.eth',
  't2010401000001.payee.eth',
  'ap.meigi.eth',
  'meigi.eth',
]
const KEYS = [
  'name',
  'description',
  'url',
  'avatar',
  'display',
  'class',
  'meigi.tNumber',
  'meigi.status',
  'meigi.registry',
  'meigi.changePending',
  'meigi.effectiveAt',
  'meigi.payees',
  'meigi.vault',
  'agent-context',
  'agent-endpoint[web]',
  'agent-status',
  'agent-registration[0x0001000003aa36a7148004a818bfb912233c491871b3d84c89a494bd9e][10525]',
]
const names = (process.env.NAMES || DEFAULT_NAMES.join(',')).split(',').filter(Boolean)
const client = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) })

for (const raw of names) {
  const name = normalize(raw)
  const [resolver, address, ...values] = await Promise.all([
    client.getEnsResolver({ name }).catch((e) => `error: ${e.shortMessage ?? e.message}`),
    client.getEnsAddress({ name }),
    ...KEYS.map((key) => client.getEnsText({ name, key })),
  ])
  const texts = Object.fromEntries(KEYS.map((key, i) => [key, values[i]]).filter(([, v]) => v !== null))
  process.stdout.write(`${JSON.stringify({ name, resolver, address, texts })}\n`)
}
