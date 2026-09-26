import { useEffect, useState } from 'react'
import type { PayeeCounter, PayeeCounts } from '../lib/registry'
import { landingConfig as env } from '../lib/config'

const REFRESH_MS = 60_000

export type { PayeeCounts }

/**
 * The one label every page shows for the registry, from the chain's own statuses: "4 active payees · 1 disputed"
 * (the disputed part only when there is one).
 */
export function payeeCountsLabel({ active, disputed }: PayeeCounts): string {
  const payees = `${active.toLocaleString('en-US')} active ${active === 1 ? 'payee' : 'payees'}`
  return disputed > 0 ? `${payees} · ${disputed.toLocaleString('en-US')} disputed` : payees
}

/**
 * Registered payees by status right now (Active, or frozen by a dispute), read live from the registry, or null
 * whenever they cannot be read. Null means "hide the figure": the page never shows an invented number.
 * Refreshes scan only new blocks and pause while the tab is hidden.
 */
export function usePayeeCounts(): PayeeCounts | null {
  const [count, setCount] = useState<PayeeCounts | null>(null)

  useEffect(() => {
    const registry = env.registry
    if (!registry) return
    let cancelled = false
    let timer: number | undefined
    let counter: PayeeCounter | null = null

    const load = async (): Promise<void> => {
      if (document.hidden) return schedule()
      try {
        const chain = await import('../lib/registry')
        counter ??= chain.createPayeeCounter(registry)
        const next = await counter.refresh()
        if (!cancelled) setCount(next)
      } catch (error) {
        // Surface it for developers; users just don't see the pill.
        reportError(error)
        if (!cancelled) setCount(null)
      }
      schedule()
    }
    const schedule = () => {
      if (!cancelled) timer = window.setTimeout(load, REFRESH_MS)
    }

    void load()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  return count
}
