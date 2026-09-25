import { useEffect, useState } from 'react'
import { ApiError } from '../../lib/api/http'
import { fetchNta, type NtaRecord } from '../../lib/api/verifier'
import { parseTNumber } from '../../lib/chain/tNumber'

export type NtaPreview =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'found'; readonly record: NtaRecord }
  | { readonly status: 'missing' }
  | { readonly status: 'offline' }
  | { readonly status: 'error'; readonly message: string }

/** Looks up the public NTA record as the user types a T-number (debounced), to show the exact name. */
export function useNtaPreview(input: string): NtaPreview {
  const [preview, setPreview] = useState<NtaPreview>({ status: 'idle' })
  const parsed = parseTNumber(input)
  const display = parsed?.display ?? null

  useEffect(() => {
    if (!display) {
      setPreview({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    setPreview({ status: 'loading' })
    const timer = window.setTimeout(() => {
      fetchNta(display, controller.signal).then(
        (record) => {
          if (!controller.signal.aborted) setPreview(record ? { status: 'found', record } : { status: 'missing' })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          if (error instanceof ApiError && error.unavailable) setPreview({ status: 'offline' })
          else setPreview({ status: 'error', message: error instanceof Error ? error.message : 'lookup failed' })
        },
      )
    }, 350)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [display])

  return preview
}
