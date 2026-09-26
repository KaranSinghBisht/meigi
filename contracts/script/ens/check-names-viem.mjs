// Resolves a company's issued names (CompanyNamespace) with stock viem, the way any ENS-aware app would, and prints
// one JSON line: the payee name's registry payout and legal name, then each issued name's address and texts. Run it
// like check-viem.mjs:
//   (cd apps/landing && node --input-type=module) < contracts/script/ens/check-names-viem.mjs
// Env: RPC_URL, T_NUMBER (2011001234567), LABELS (ap,keiri,zeirishi).
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { normalize } from 'viem/ens'

if (!process.env.RPC_URL) throw new Error('Set RPC_URL (viem would otherwise fall back to a public third-party RPC)')
const parent = normalize(`t${process.env.T_NUMBER || '2011001234567'}.payee.eth`)
const labels = (process.env.LABELS || 'ap,keiri,zeirishi').split(',').filter(Boolean)
const client = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) })

const resolveName = async (label) => {
  const name = normalize(`${label}.${parent}`)
  const [address, description, agentStatus] = await Promise.all([
    client.getEnsAddress({ name }),
    client.getEnsText({ name, key: 'description' }),
    client.getEnsText({ name, key: 'agent-status' }),
  ])
  return [label, { name, address, description, agentStatus }]
}

const [payout, legalName, ...names] = await Promise.all([
  client.getEnsAddress({ name: parent }),
  client.getEnsText({ name: parent, key: 'name' }),
  ...labels.map(resolveName),
])
process.stdout.write(`${JSON.stringify({ parent, payout, legalName, names: Object.fromEntries(names) })}\n`)
