// Reverse-resolves an address with stock viem (Sepolia, no overrides): the name a wallet or explorer shows for it.
// Prints one JSON line. Fed through stdin, Node resolves `viem` from the working directory:
//   (cd apps/landing && node --input-type=module) < contracts/script/ens/check-primary-viem.mjs
// Env: RPC_URL, ENS_ADDRESS.
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

if (!process.env.RPC_URL) throw new Error('Set RPC_URL (viem would otherwise fall back to a public third-party RPC)')
if (!process.env.ENS_ADDRESS) throw new Error('Set ENS_ADDRESS')
const address = process.env.ENS_ADDRESS
const client = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) })

const name = await client.getEnsName({ address })
const universalResolver = `viem default ${sepolia.contracts.ensUniversalResolver.address}`
process.stdout.write(`${JSON.stringify({ address, name, universalResolver })}\n`)
