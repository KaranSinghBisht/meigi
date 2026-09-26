import { useEffect, useState } from 'react'
import { ApiError } from '../../../lib/api/http'
import { explainError } from '../../../lib/api/messages'
import { fetchNta, type NtaRecord } from '../../../lib/api/verifier'

/** Every answer names the T-number it is about, so a stale answer is never read as the current one. */
export type NtaPreview =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly tNumber: string }
  | { readonly status: 'found'; readonly tNumber: string; readonly record: NtaRecord }
  | { readonly status: 'missing'; readonly tNumber: string }
  /** Registry office 9999: a fictional demo company, which needs no NTA record. */
  | { readonly status: 'fixture'; readonly tNumber: string }
  | { readonly status: 'offline'; readonly tNumber: string }
  | { readonly status: 'error'; readonly tNumber: string; readonly message: string }

/** Looks up the public NTA record for a canonical T-number ("T" + 13 digits, or null), debounced. */
export function useNtaPreview(tNumber: string | null): NtaPreview {
  const [preview, setPreview] = useState<NtaPreview>({ status: 'idle' })

  useEffect(() => {
    if (!tNumber) {
      setPreview({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    setPreview({ status: 'loading', tNumber })
    const timer = window.setTimeout(() => {
      fetchNta(tNumber, controller.signal).then(
        ({ fixture, record }) => {
          if (controller.signal.aborted) return
          if (fixture) setPreview({ status: 'fixture', tNumber })
          else setPreview(record ? { status: 'found', tNumber, record } : { status: 'missing', tNumber })
        },
        (error: unknown) => {
          if (controller.signal.aborted) return
          if (error instanceof ApiError && error.unavailable) setPreview({ status: 'offline', tNumber })
          else setPreview({ status: 'error', tNumber, message: explainError(error, 'verifier').title })
        },
      )
    }, 250)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [tNumber])

  return preview
}
