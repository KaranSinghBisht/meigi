import { useCallback, useEffect, useRef, useState } from 'react'
import { refuseLive, type LiveRefusal } from '../../../lib/chain/refusal'

export type RefusalRun =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'refused'; readonly refusal: Extract<LiveRefusal, { live: true }> }
  /** Sepolia couldn't be read, or answered anything but the refusal: the page shows the recorded run instead. */
  | { readonly kind: 'recorded' }

/** One live refusal per click. The newest click wins; an unmounted page ignores a late answer. */
export function useLiveRefusal() {
  const [run, setRun] = useState<RefusalRun>({ kind: 'idle' })
  const latest = useRef(0)
  useEffect(
    () => () => {
      latest.current = -1
    },
    [],
  )
  const start = useCallback(async () => {
    const id = ++latest.current
    setRun({ kind: 'running' })
    let next: RefusalRun
    try {
      const refusal = await refuseLive()
      next = refusal.live ? { kind: 'refused', refusal } : { kind: 'recorded' }
    } catch (error) {
      reportError(error) // the chain couldn't be read: surface it for developers, show the recorded run
      next = { kind: 'recorded' }
    }
    if (latest.current === id) setRun(next)
  }, [])
  return { run, start }
}
