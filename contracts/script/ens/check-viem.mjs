// Resolves a Meigi payee name with viem, the way any ENS-aware app would, and prints one JSON line.
// Fed through stdin, Node resolves `viem` from the working directory, so run it from a package that
// depends on viem: (cd apps/landing && node --input-type=module) < contracts/script/ens/check-viem.mjs
// Env: RPC_URL, ENS_NAME (t2011001234567.payee.eth), VIEM_UR (a UniversalResolver; empty = viem's default).
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { normalize } from 'viem/ens'

if (!process.env.RPC_URL) throw new Error('Set RPC_URL (viem would otherwise fall back to a public third-party RPC)')
const name = normalize(process.env.ENS_NAME || 't2011001234567.payee.eth')
const universalResolverAddress = process.env.VIEM_UR || undefined
const client = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) })
const query = { name, universalResolverAddress }

const [address, legalName, status] = await Promise.all([
  client.getEnsAddress(query),
  client.getEnsText({ ...query, key: 'name' }),
  client.getEnsText({ ...query, key: 'meigi.status' }),
])
const universalResolver = universalResolverAddress ?? `viem default ${sepolia.contracts.ensUniversalResolver.address}`
process.stdout.write(`${JSON.stringify({ name, universalResolver, address, legalName, status })}\n`)
