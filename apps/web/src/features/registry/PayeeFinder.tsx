import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { FIXTURE_T_NUMBER, parseTNumber, type ParsedTNumber } from '../../lib/chain/tNumber'
import { Button } from '../../ui/components/Button'
import '../../ui/components/field.css'
import { useEdgeFade } from './useEdgeFade'
import type { DirectoryPayee, RegistryFeed } from './useRegistryFeed'
import './finder.css'

/** Folds full-width input and case, and drops the spaces and hyphens people type into T-numbers. */
function fold(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\s-]/g, '')
}

function matches(payee: DirectoryPayee, query: string): boolean {
  if (!query) return true
  return fold(payee.tNumber).includes(query) || (payee.name !== null && fold(payee.name).includes(query))
}

interface RowProps {
  readonly payee: DirectoryPayee
  readonly current: boolean
  readonly onOpen: (tNumber: string) => void
}

function Row({ payee, current, onOpen }: RowProps) {
  const disputed = payee.status === 'disputed'
  return (
    <li className="finder__row">
      <button
        type="button"
        className={disputed ? 'finder__item finder__item--disputed' : 'finder__item'}
        aria-current={current ? 'true' : undefined}
        title={payee.name ?? undefined}
        onClick={() => onOpen(payee.tNumber)}
      >
        <span className="finder__dot" aria-hidden="true" />
        <span className="finder__name">
          {disputed ? (
            'Disputed'
          ) : (
            <span className="jp" lang="ja">
              {payee.name}
            </span>
          )}
        </span>
        {disputed ? null : <span className="sr-only">, active</span>}
        <span className="finder__t mono">{payee.tNumber}</span>
      </button>
    </li>
  )
}

interface PayeeFinderProps {
  readonly feed: RegistryFeed
  readonly current: string | null
  readonly onOpen: (tNumber: ParsedTNumber) => void
}

/** The query, the payees it matches, and what submitting it does: a full T-number, or the one match left. */
function useFinder(feed: RegistryFeed, onOpen: (tNumber: ParsedTNumber) => void) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const folded = fold(query)
  const shown = useMemo(() => feed.payees.filter((payee) => matches(payee, folded)), [feed.payees, folded])
  const change = (next: string) => {
    setQuery(next)
    setError(null)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseTNumber(query) ?? (shown.length === 1 ? parseTNumber(shown[0]?.tNumber ?? '') : null)
    if (parsed) {
      setError(null)
      onOpen(parsed)
    } else {
      setError(`Type a full T-number (T and 13 digits, like ${FIXTURE_T_NUMBER}), or pick a payee below.`)
    }
  }
  return { query, change, error, submit, shown, filtering: folded !== '' }
}

interface ListProps {
  readonly feed: RegistryFeed
  readonly shown: readonly DirectoryPayee[]
  readonly filtering: boolean
  readonly current: string | null
  readonly onOpen: (tNumber: string) => void
}

/** Every registered payee that matches, in a list that scrolls inside itself and fades at the hidden edge. */
function FinderList({ feed, shown, filtering, current, onOpen }: ListProps) {
  const list = useRef<HTMLUListElement>(null)
  useEdgeFade(list, shown.length)
  return (
    <>
      <div className="finder__head">
        <p className="eyebrow">Registered on Sepolia</p>
        <p className="finder__count" aria-live="polite">
          {filtering ? `${shown.length} of ${feed.payees.length}` : feed.payees.length}
        </p>
      </div>
      {shown.length > 0 ? (
        <ul ref={list} className="finder__list" aria-label="Registered payees">
          {shown.map((payee) => (
            <Row key={payee.tNumber} payee={payee} current={payee.tNumber === current} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="finder__empty">
          {feed.status === 'loading' ? 'Reading the registry…' : 'No registered payee matches.'}
        </p>
      )}
    </>
  )
}

/**
 * One search box for the registry: typing filters the registered payees below by name or T-number, and a full
 * T-number looks up any company, registered or not. The list scrolls inside itself, however long it grows.
 */
export function PayeeFinder({ feed, current, onOpen }: PayeeFinderProps) {
  const id = useId()
  const finder = useFinder(feed, onOpen)
  const open = (tNumber: string) => {
    const parsed = parseTNumber(tNumber)
    if (parsed) onOpen(parsed)
  }
  return (
    <form className="finder" onSubmit={finder.submit} role="search" noValidate>
      <label className="field__label" htmlFor={id}>
        Find a payee
      </label>
      <div className="finder__search">
        <input
          id={id}
          className="input"
          value={finder.query}
          onChange={(event) => finder.change(event.target.value)}
          placeholder="Company name or T-number"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={finder.error ? true : undefined}
          aria-describedby={finder.error ? `${id}-error` : undefined}
        />
        <Button type="submit">Look up</Button>
      </div>
      {finder.error ? (
        <p id={`${id}-error`} className="field__error">
          {finder.error}
        </p>
      ) : null}
      <FinderList feed={feed} shown={finder.shown} filtering={finder.filtering} current={current} onOpen={open} />
    </form>
  )
}
