import { useEffect, useState } from 'react'
import type { PayeeCounter } from '../../lib/chain/registry'
import { env } from '../../lib/env/env'

const REFRESH_MS = 60_000

/**
 * Live count of registered payees, or null whenever it cannot be read.
 * Null means "hide the figure": the page never shows an invented number.
 * Refreshes scan only new blocks and pause while the tab is hidden.
 */
export function usePayeeCount(): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    const registry = env.registry
    if (!registry) return
    let cancelled = false
    let timer: number | undefined
    let counter: PayeeCounter | null = null

    const load = async (): Promise<void> => {
      if (document.hidden) return schedule()
      try {
        const chain = await import('../../lib/chain/registry')
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
