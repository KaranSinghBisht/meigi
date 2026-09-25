// Live reads against the Meigi PayeeRegistry on Sepolia. This module pulls in
// viem, so UI code loads it with a dynamic import.

import { payeeRegistryAbi } from '@meigi/abi'
import { BaseError, HttpRequestError, TimeoutError, createPublicClient, getAbiItem, http } from 'viem'
import { sepolia } from 'viem/chains'
import type { HexAddress, RegistryConfig } from '../env/env'

/** IPayeeRegistry.Status */
const STATUS = { none: 0, active: 1, disputed: 2 } as const

/**
 * What the resolver may show. Only an active payee exposes its name and
 * payout; a queued payout change surfaces as a date, never as an address.
 */
export type PayeeLookup =
  | {
      readonly kind: 'active'
      readonly legalName: string
      readonly payout: HexAddress
      readonly changePendingUntil: Date | null
    }
  | { readonly kind: 'disputed'; readonly changePendingUntil: Date | null }
  | { readonly kind: 'not-registered' }

/** Network trouble, or a registry that answered wrongly (wrong chain, address or ABI). */
export type ChainFailure = 'network' | 'registry'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
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

export function classifyChainError(error: unknown): ChainFailure {
  if (error instanceof RegistryMismatchError) return 'registry'
  if (error instanceof BaseError) {
    const offline = error.walk((cause) => cause instanceof HttpRequestError || cause instanceof TimeoutError)
    return offline ? 'network' : 'registry'
  }
  return 'network'
}

function pendingUntil(pending: HexAddress, effectiveAt: bigint): Date | null {
  if (pending === ZERO_ADDRESS || effectiveAt === 0n) return null
  return new Date(Number(effectiveAt) * 1000)
}

export async function lookupPayee(config: RegistryConfig, tNumber: bigint): Promise<PayeeLookup> {
  const client = clientFor(config)
  await verifyRegistry(client, config)
  const payee = await client.readContract({
    address: config.address,
    abi: payeeRegistryAbi,
    functionName: 'payeeOf',
    args: [tNumber],
  })
  const changePendingUntil = pendingUntil(payee.pending, payee.effectiveAt)
  if (payee.status === STATUS.disputed) return { kind: 'disputed', changePendingUntil }
  if (payee.status !== STATUS.active || payee.payout === ZERO_ADDRESS) return { kind: 'not-registered' }
  return { kind: 'active', legalName: payee.legalName, payout: payee.payout, changePendingUntil }
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

async function collectInChunks(client: RegistryClient, config: RegistryConfig, from: bigint, to: bigint, seen: Set<bigint>) {
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

export interface PayeeCounter {
  /** Distinct T-numbers that emitted PayeeRegistered. Throws instead of guessing. */
  refresh: () => Promise<number>
}

/** Scans from the configured start block once, then only blocks added since the last refresh. */
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
      return seen.size
    },
  }
}
