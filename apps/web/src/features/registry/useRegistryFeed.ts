import { useEffect, useMemo, useRef, useState } from 'react'
import { describeChainError } from '../../lib/chain/errors'
import { blockTimestamps, scanRegistryEvents, type FeedEvent } from '../../lib/chain/events'
import { env } from '../../lib/env/env'

const POLL_MS = 15_000
const TIMESTAMPED = 40
/** Public RPCs are load-balanced: a lagging node can miss the newest blocks, so each poll rescans a few. */
const OVERLAP = 6n

/** One registered T-number as the logs tell it. A disputed one's name isn't shown, as everywhere in the explorer. */
export interface DirectoryPayee {
  readonly tNumber: string
  readonly name: string | null
  readonly status: 'active' | 'disputed'
}

export interface RegistryFeed {
  readonly status: 'loading' | 'ready' | 'error'
  /** Newest first. */
  readonly events: readonly FeedEvent[]
  readonly times: ReadonlyMap<bigint, Date>
  readonly lastBlock: bigint | null
  readonly error: string | null
  /** Active registered payees seen in the logs: T-number → legal name. */
  readonly directory: ReadonlyMap<string, string>
  /** Every registered T-number, newest registration first, with its status. */
  readonly payees: readonly DirectoryPayee[]
}

function newestFirst(a: FeedEvent, b: FeedEvent): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1
  return b.logIndex - a.logIndex
}

function merge(current: readonly FeedEvent[], incoming: readonly FeedEvent[]): FeedEvent[] {
  const seen = new Set(current.map((event) => event.id))
  return [...current, ...incoming.filter((event) => !seen.has(event.id))].sort(newestFirst)
}

/**
 * Logs from the deployment block onwards, then every 15 s from just before the last scanned block (events
 * are de-duplicated by id). A failed poll keeps what was loaded, reports the error, and the next poll
 * retries from the same block.
 */
function useFeedPolling() {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [lastBlock, setLastBlock] = useState<bigint | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const next = useRef(env.registryFromBlock)

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const poll = async () => {
      try {
        const result = await scanRegistryEvents(next.current, controller.signal)
        if (controller.signal.aborted) return
        const resume = result.toBlock + 1n - OVERLAP
        next.current = resume > env.registryFromBlock ? resume : env.registryFromBlock
        setEvents((current) => merge(current, result.events))
        setLastBlock(result.toBlock)
        setError(null)
      } catch (reason) {
        if (!controller.signal.aborted) setError(describeChainError(reason).message)
      }
      if (controller.signal.aborted) return
      setLoaded(true)
      timer = window.setTimeout(() => void poll(), POLL_MS)
    }
    void poll()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [])

  return { events, lastBlock, error, loaded }
}

/** Timestamps for the newest events (block timestamps are cached per block). */
function useBlockTimes(events: readonly FeedEvent[]): ReadonlyMap<bigint, Date> {
  const [times, setTimes] = useState<ReadonlyMap<bigint, Date>>(new Map())
  useEffect(() => {
    const blocks = events.slice(0, TIMESTAMPED).map((event) => event.blockNumber)
    if (blocks.length === 0) return
    let live = true
    void blockTimestamps(blocks).then((found) => {
      if (live) setTimes(found)
    })
    return () => {
      live = false
    }
  }, [events])
  return times
}

/** Walks the logs oldest first: who registered, and who is frozen by a dispute right now. */
function directoryOf(events: readonly FeedEvent[]) {
  const names = new Map<string, string>()
  const order: string[] = []
  const frozen = new Set<string>()
  for (const event of [...events].reverse()) {
    if (event.name === 'PayeeRegistered' && event.legalName) {
      if (!names.has(event.tNumber)) order.push(event.tNumber)
      names.set(event.tNumber, event.legalName)
    }
    if (event.name === 'ClaimDisputed') frozen.add(event.tNumber)
    if (event.name === 'DisputeResolved' || event.name === 'DisputeDismissed') frozen.delete(event.tNumber)
  }
  const payees: DirectoryPayee[] = order
    .reverse()
    .map((tNumber) =>
      frozen.has(tNumber)
        ? { tNumber, name: null, status: 'disputed' }
        : { tNumber, name: names.get(tNumber) ?? null, status: 'active' },
    )
  // A frozen payee's name never leaves this function: the feed and the list show only its status.
  for (const tNumber of frozen) names.delete(tNumber)
  return { directory: names as ReadonlyMap<string, string>, payees }
}

export function useRegistryFeed(): RegistryFeed {
  const { events, lastBlock, error, loaded } = useFeedPolling()
  const times = useBlockTimes(events)
  const { directory, payees } = useMemo(() => directoryOf(events), [events])
  const status = !loaded ? 'loading' : error && events.length === 0 ? 'error' : 'ready'
  return { status, events, times, lastBlock, error, directory, payees }
}
