import { useEffect, useState } from 'react'
import { lookupLeiViaVerifier, parseLei, type LeiRecord, type NtaMatch } from '../../../lib/api/lei'
import { explainError, type Explained } from '../../../lib/api/messages'
import { normaliseTNumber, parseTNumber } from '../../../lib/chain/tNumber'
import { useNtaPreview, type NtaPreview } from './useNtaPreview'

/** What the reader typed: a T-number (whole or on its way), an LEI, or neither yet. */
export type QueryKind = 'empty' | 'tNumber' | 'partial' | 'lei' | 'badLei' | 'other'

export type LeiLookup =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading'; readonly lei: string }
  | { readonly kind: 'done'; readonly lei: string; readonly record: LeiRecord }
  | { readonly kind: 'failed'; readonly lei: string; readonly error: Explained }

export interface CompanyLookup {
  readonly kind: QueryKind
  /** The T-number digits typed so far, or linked from the LEI: the live ENS name. */
  readonly digits: string
  readonly lei: LeiLookup
  /** T-numbers whose NTA name is exactly the LEI's legal name. */
  readonly matches: readonly NtaMatch[]
  /** The canonical T-number to register, once there is one. */
  readonly tNumber: string | null
  readonly nta: NtaPreview
}

const PARTIAL_T_NUMBER = /^T?(\d{0,12})$/
const LEI_SHAPE = /^[A-Z0-9]{20}$/

function classify(compact: string): QueryKind {
  if (compact === '') return 'empty'
  if (parseTNumber(compact)) return 'tNumber'
  if (PARTIAL_T_NUMBER.test(compact)) return 'partial'
  if (parseLei(compact)) return 'lei'
  return LEI_SHAPE.test(compact) ? 'badLei' : 'other'
}

/** GLEIF's record for an LEI through the verifier, which also links a Japanese entity to its T-number. */
function useLeiLookup(lei: string | null): LeiLookup {
  const [state, setState] = useState<LeiLookup>({ kind: 'none' })
  useEffect(() => {
    if (!lei) {
      setState({ kind: 'none' })
      return
    }
    const controller = new AbortController()
    setState({ kind: 'loading', lei })
    lookupLeiViaVerifier(lei, controller.signal).then(
      (record) => {
        if (!controller.signal.aborted) setState({ kind: 'done', lei, record })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ kind: 'failed', lei, error: explainError(error, 'verifier') })
      },
    )
    return () => controller.abort()
  }, [lei])
  return state
}

/** An answer about another LEI than the one on screen (for the render before the new lookup starts) is not one. */
function current(lei: LeiLookup, code: string | null): LeiLookup {
  if (lei.kind === 'none' || lei.lei === code) return lei
  return code ? { kind: 'loading', lei: code } : { kind: 'none' }
}

/** Reads the first step's one field: a T-number goes straight to the NTA index, an LEI through GLEIF first. */
export function useCompanyLookup(query: string, picked: string | null): CompanyLookup {
  const compact = normaliseTNumber(query)
  const kind = classify(compact)
  const code = kind === 'lei' ? parseLei(compact) : null
  const lei = current(useLeiLookup(code), code)
  const matches = lei.kind === 'done' ? (lei.record.ntaMatches ?? []) : []
  const linked = matches.find((match) => match.tNumber === picked) ?? matches[0] ?? null
  const tNumber = kind === 'tNumber' ? (parseTNumber(compact)?.display ?? null) : (linked?.tNumber ?? null)
  const nta = useNtaPreview(tNumber)
  const typed = PARTIAL_T_NUMBER.exec(compact)?.[1] ?? ''
  const digits = tNumber ? tNumber.slice(1) : kind === 'partial' ? typed : ''
  return { kind, digits, lei, matches, tNumber, nta }
}
