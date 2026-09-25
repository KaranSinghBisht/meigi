// Registry event history from eth_getLogs. Public RPCs cap the block range of a log query, so scans run in
// chunks and halve the chunk whenever the RPC refuses a range. Queued addresses (the `to` of a request, the
// `cancelled` of a cancellation, a queued dispute winner) are dropped here and never reach the UI.

import { payeeRegistryAbi } from '@meigi/abi'
import type { AbiEvent, Hex } from 'viem'
import { env, type HexAddress } from '../env/env'
import { publicClient } from './client'
import { tNumberFromValue } from './tNumber'

export type FeedEventName =
  | 'PayeeRegistered'
  | 'PayoutChangeRequested'
  | 'PayoutChangeCancelled'
  | 'PayoutChanged'
  | 'ControllerRotationRequested'
  | 'ControllerRotationCancelled'
  | 'ControllerRotated'
  | 'ClaimDisputed'
  | 'DisputeResolutionQueued'
  | 'DisputeResolved'
  | 'DisputeDismissed'
  | 'OfficersUpdated'

export interface FeedEvent {
  readonly id: string
  readonly name: FeedEventName
  readonly tNumber: string
  readonly blockNumber: bigint
  readonly logIndex: number
  readonly txHash: Hex
  readonly legalName?: string
  /** An address that is (now) live: a registered or landed payout, never a queued one. */
  readonly payout?: HexAddress
  readonly controller?: HexAddress
  readonly by?: HexAddress
  readonly landsAt?: Date
  readonly officers?: { readonly count: number; readonly threshold: number }
}

const FEED_NAMES = new Set<string>([
  'PayeeRegistered',
  'PayoutChangeRequested',
  'PayoutChangeCancelled',
  'PayoutChanged',
  'ControllerRotationRequested',
  'ControllerRotationCancelled',
  'ControllerRotated',
  'ClaimDisputed',
  'DisputeResolutionQueued',
  'DisputeResolved',
  'DisputeDismissed',
  'OfficersUpdated',
])

const feedEvents: AbiEvent[] = payeeRegistryAbi.filter(
  (item): item is Extract<(typeof payeeRegistryAbi)[number], { type: 'event' }> =>
    item.type === 'event' && FEED_NAMES.has(item.name),
)

const INITIAL_CHUNK = 20_000n
const MIN_CHUNK = 250n

type Args = Record<string, unknown>

const addr = (value: unknown): HexAddress | undefined =>
  typeof value === 'string' && value.startsWith('0x') ? (value as HexAddress) : undefined
const date = (value: unknown): Date | undefined =>
  typeof value === 'bigint' && value > 0n ? new Date(Number(value) * 1000) : undefined

/** Only the fields that are safe to show for each event. */
function safeDetails(name: FeedEventName, args: Args): Partial<FeedEvent> {
  switch (name) {
    case 'PayeeRegistered':
      return { legalName: String(args.legalName ?? ''), payout: addr(args.payout), controller: addr(args.controller) }
    case 'PayoutChangeRequested':
    case 'ControllerRotationRequested':
      return { landsAt: date(args.effectiveAt) }
    case 'PayoutChangeCancelled':
    case 'ControllerRotationCancelled':
      return { by: addr(args.by) }
    case 'PayoutChanged':
      return { payout: addr(args.to) }
    case 'ControllerRotated':
      return { controller: addr(args.to) }
    case 'DisputeResolutionQueued':
      return { landsAt: date(args.resolvesAt) }
    case 'DisputeResolved':
      return { payout: addr(args.payout), controller: addr(args.controller) }
    case 'OfficersUpdated':
      return { officers: { count: Number(args.count ?? 0), threshold: Number(args.threshold ?? 0) } }
    case 'ClaimDisputed':
    case 'DisputeDismissed':
      return {}
  }
}

interface RawLog {
  eventName?: string
  args?: unknown
  blockNumber: bigint | null
  transactionHash: Hex | null
  logIndex: number | null
}

function toFeedEvent(log: RawLog): FeedEvent | null {
  const name = log.eventName
  if (!name || !FEED_NAMES.has(name) || log.blockNumber === null || log.transactionHash === null) return null
  const args = (log.args ?? {}) as Args
  if (typeof args.tNumber !== 'bigint') return null
  const feedName = name as FeedEventName
  return {
    id: `${log.transactionHash}:${log.logIndex ?? 0}`,
    name: feedName,
    tNumber: tNumberFromValue(args.tNumber).display,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex ?? 0,
    txHash: log.transactionHash,
    ...safeDetails(feedName, args),
  }
}

async function logsBetween(from: bigint, to: bigint): Promise<RawLog[]> {
  return publicClient.getLogs({ address: env.registry, events: feedEvents, fromBlock: from, toBlock: to })
}

export interface ScanResult {
  readonly events: FeedEvent[]
  readonly toBlock: bigint
}

const RANGE_HINTS = ['range', 'limit', 'too many', 'more than', 'exceed', 'too large', 'timed out', 'timeout']

/**
 * Providers word it differently: "block range too wide", "query returned more than 10000 results", …
 * A rate limit (HTTP 429) is not a range problem: shrinking would only send more requests.
 */
function isRangeRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('429') || message.includes('rate limit')) return false
  return RANGE_HINTS.some((hint) => message.includes(hint))
}

/** Scans [from, latest] in chunks, halving the chunk when the RPC rejects a range as too large. */
export async function scanRegistryEvents(from: bigint, signal?: AbortSignal): Promise<ScanResult> {
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 })
  const events: FeedEvent[] = []
  let chunk = INITIAL_CHUNK
  let start = from
  while (start <= latest) {
    if (signal?.aborted) throw new DOMException('scan aborted', 'AbortError')
    const end = start + chunk - 1n < latest ? start + chunk - 1n : latest
    try {
      const logs = await logsBetween(start, end)
      for (const log of logs) {
        const event = toFeedEvent(log)
        if (event) events.push(event)
      }
      start = end + 1n
    } catch (error) {
      if (chunk / 2n < MIN_CHUNK || !isRangeRejection(error)) throw error
      chunk /= 2n
    }
  }
  return { events, toBlock: latest }
}

const blockTimes = new Map<bigint, Date>()

/** Timestamps for the given blocks, cached; blocks the RPC can't return are simply absent. */
export async function blockTimestamps(blocks: readonly bigint[]): Promise<Map<bigint, Date>> {
  const missing = [...new Set(blocks)].filter((block) => !blockTimes.has(block))
  const results = await Promise.allSettled(missing.map((blockNumber) => publicClient.getBlock({ blockNumber })))
  results.forEach((result, index) => {
    const block = missing[index]
    if (result.status === 'fulfilled' && block !== undefined) {
      blockTimes.set(block, new Date(Number(result.value.timestamp) * 1000))
    }
  })
  return new Map(blocks.filter((b) => blockTimes.has(b)).map((b) => [b, blockTimes.get(b) as Date]))
}
