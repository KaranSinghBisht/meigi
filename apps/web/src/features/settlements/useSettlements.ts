import { useEffect, useState } from 'react'
import { ApiError } from '../../lib/api/http'
import { fetchSettlements, type Settlements } from '../../lib/api/settlements'

export type SettlementsLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: Settlements; readonly checkedAt: Date; readonly stale: boolean }
  | { readonly kind: 'error'; readonly message: string }

/** The API caches MultiBaas for 45 s; polling a little faster than that shows a new row within a minute. */
const POLL_MS = 30_000

function message(error: unknown): string {
  if (error instanceof ApiError && error.unavailable) return 'The settlements feed could not be reached.'
  return 'Curvegrid MultiBaas is unavailable right now.'
}

/** Settlements read live from the site's API, refreshed every 30 s. A failed refresh keeps the last answer. */
export function useSettlements(tNumber?: string): SettlementsLoad {
  const [load, setLoad] = useState<SettlementsLoad>({ kind: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () =>
      fetchSettlements(tNumber, controller.signal).then(
        (data) => setLoad({ kind: 'ready', data, checkedAt: new Date(), stale: false }),
        (error: unknown) => {
          if (controller.signal.aborted) return
          setLoad((last) => (last.kind === 'ready' ? { ...last, stale: true } : { kind: 'error', message: message(error) }))
        },
      )
    setLoad({ kind: 'loading' })
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [tNumber])
  return load
}
