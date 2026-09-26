// ENSIP-25 check from the registry's side, with stock viem: the ERC-8004 agent's registration file names an ENS
// name, and that name carries `agent-registration[<registry>][<agentId>]`. Prints one JSON line.
// Run it like check-viem.mjs: (cd apps/landing && node --input-type=module) < contracts/script/ens/check-agent-8004-viem.mjs
// Env: RPC_URL, AGENT_ID, ERC8004_IDENTITY_REGISTRY (default: the Sepolia v2.0.0 deployment).
import { createPublicClient, http, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'

if (!process.env.RPC_URL || !process.env.AGENT_ID) throw new Error('Set RPC_URL and AGENT_ID')
const registry = process.env.ERC8004_IDENTITY_REGISTRY || '0x8004A818BFB912233c491871b3d84c89A494BD9e'
const client = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) })
const agentId = BigInt(process.env.AGENT_ID)

const abi = parseAbi(['function tokenURI(uint256) view returns (string)'])
const uri = await client.readContract({ address: registry, abi, functionName: 'tokenURI', args: [agentId] })
const prefix = 'data:application/json;base64,'
if (!uri.startsWith(prefix)) throw new Error('expected an on-chain data: URI registration file')
const card = JSON.parse(Buffer.from(uri.slice(prefix.length), 'base64').toString('utf8'))
const ens = card.services?.find((service) => service.name === 'ENS')?.endpoint
if (!ens) throw new Error('the registration file names no ENS service')

// ERC-7930: version 1, chain type eip155 (0), then the length-prefixed chain id and address.
let chain = sepolia.id.toString(16)
if (chain.length % 2) chain = `0${chain}`
const erc7930 = `0x00010000${(chain.length / 2).toString(16).padStart(2, '0')}${chain}14${registry.slice(2).toLowerCase()}`
const key = `agent-registration[${erc7930}][${agentId}]`
const [value, address] = await Promise.all([client.getEnsText({ name: ens, key }), client.getEnsAddress({ name: ens })])
process.stdout.write(`${JSON.stringify({ agentId: agentId.toString(), name: card.name, ens, address, key, value, verified: Boolean(value) })}\n`)
