// Live reads against the Meigi PayeeRegistry on Sepolia. This module pulls in
// viem, so UI code loads it with a dynamic import.

import { payeeRegistryAbi } from '@meigi/abi'
import { createPublicClient, getAbiItem, http } from 'viem'
import { sepolia } from 'viem/chains'
import type { RegistryConfig } from './config'

const LOG_CHUNK = 10_000n
const MAX_LOG_CHUNKS = 60n

const payeeRegistered = getAbiItem({ abi: payeeRegistryAbi, name: 'PayeeRegistered' })

class RegistryMismatchError extends Error {
  override name = 'RegistryMismatchError'
}

function makeClient(rpcUrl: string) {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 12_000, retryCount: 1 }),
  })
}

type RegistryClient = ReturnType<typeof makeClient>

const clients = new Map<string, RegistryClient>()
const verified = new Map<string, Promise<void>>()

function clientFor(config: RegistryConfig): RegistryClient {
  const existing = clients.get(config.rpcUrl)
  if (existing) return existing
  const client = makeClient(config.rpcUrl)
  clients.set(config.rpcUrl, client)
  return client
}

/** Confirms, once per RPC and address, that we talk to Sepolia and that the address holds code. */
function verifyRegistry(client: RegistryClient, config: RegistryConfig): Promise<void> {
  const key = `${config.rpcUrl}|${config.address}`
  const cached = verified.get(key)
  if (cached) return cached
  const check = (async () => {
    const [chainId, code] = await Promise.all([client.getChainId(), client.getCode({ address: config.address })])
    if (chainId !== sepolia.id) throw new RegistryMismatchError(`RPC serves chain ${chainId}, not Sepolia`)
    if (!code || code === '0x') throw new RegistryMismatchError('No contract deployed at the registry address')
  })()
  verified.set(key, check)
  // A failed check is retried on the next call instead of being cached.
  check.catch(() => verified.delete(key))
  return check
}

async function logsInRange(client: RegistryClient, config: RegistryConfig, from: bigint, to: bigint) {
  return client.getLogs({
    address: config.address,
    event: payeeRegistered,
    fromBlock: from,
    toBlock: to,
    strict: true,
  })
}

async function collectInChunks(
  client: RegistryClient,
  config: RegistryConfig,
  from: bigint,
  to: bigint,
  seen: Set<bigint>,
) {
  if ((to - from) / LOG_CHUNK > MAX_LOG_CHUNKS) {
    throw new Error('Registry log range is too large for a chunked scan')
  }
  for (let start = from; start <= to; start += LOG_CHUNK) {
    const end = start + LOG_CHUNK - 1n < to ? start + LOG_CHUNK - 1n : to
    const logs = await logsInRange(client, config, start, end)
    for (const log of logs) seen.add(log.args.tNumber)
  }
}

async function collect(client: RegistryClient, config: RegistryConfig, from: bigint, to: bigint, seen: Set<bigint>) {
  try {
    const logs = await logsInRange(client, config, from, to)
    for (const log of logs) seen.add(log.args.tNumber)
  } catch (error) {
    // Public RPCs often cap eth_getLogs ranges: retry in chunks when the range
    // starts at a known block, otherwise surface the failure.
    if (config.fromBlock === null) throw error
    await collectInChunks(client, config, from, to, seen)
  }
}

/**
 * How many of `tNumbers` are Active right now. A dispute freezes a payee, so
 * it no longer counts as verified. One Multicall3 round trip; any failed call
 * throws rather than under-counting.
 */
async function countActive(
  client: RegistryClient,
  config: RegistryConfig,
  tNumbers: readonly bigint[],
): Promise<number> {
  if (tNumbers.length === 0) return 0
  const active = await client.multicall({
    contracts: tNumbers.map(
      (tNumber) =>
        ({ address: config.address, abi: payeeRegistryAbi, functionName: 'isActive', args: [tNumber] }) as const,
    ),
    allowFailure: false,
  })
  return active.filter(Boolean).length
}

export interface PayeeCounter {
  /** Registered payees whose status is Active right now. Throws instead of guessing. */
  refresh: () => Promise<number>
}

/**
 * Finds registered T-numbers from PayeeRegistered logs (the full range once,
 * then only new blocks) and re-checks every one's status on each refresh.
 */
export function createPayeeCounter(config: RegistryConfig): PayeeCounter {
  const client = clientFor(config)
  const seen = new Set<bigint>()
  let next = config.fromBlock ?? 0n
  return {
    refresh: async () => {
      await verifyRegistry(client, config)
      const latest = await client.getBlockNumber()
      if (next > latest + 1n) throw new RegistryMismatchError('Start block is ahead of the chain head')
      if (next <= latest) {
        await collect(client, config, next, latest, seen)
        next = latest + 1n
      }
      return countActive(client, config, [...seen])
    },
  }
}
