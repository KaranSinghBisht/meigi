import { useState, type FormEvent } from 'react'
import type { LeiRecord } from '../../lib/api/lei'
import { Badge } from '../../ui/components/Badge'
import { Button } from '../../ui/components/Button'
import { TextField } from '../../ui/components/Field'
import { ErrorNotice } from '../../ui/components/Notice'
import { LEI_EXAMPLES } from './content'
import { useLeiLookup, type LeiSource, type LeiState } from './useLeiLookup'
import './business.css'

function NtaLink({ record, source }: { readonly record: LeiRecord; readonly source: LeiSource }) {
  if (source === 'gleif' || record.ntaMatches === null) {
    return <p className="muted">T-number link: needs the Meigi verifier, which only runs on the demo machine.</p>
  }
  if (record.ntaMatches.length === 0) {
    const japanese = record.country === 'JP' || record.jurisdiction === 'JP'
    return (
      <p className="muted">
        {japanese
          ? 'No T-number link: no NTA corporation has exactly this legal name.'
          : 'No T-number link: not a Japanese company (T-numbers are Japanese).'}
      </p>
    )
  }
  return (
    <p className="biz-lei__nta">
      {record.ntaMatches.map((match) => (
        <span key={match.tNumber}>
          Linked to <span className="mono">{match.tNumber}</span> ={' '}
          <span className="jp" lang="ja">
            {match.name}
          </span>{' '}
          (exact NTA name match)
        </span>
      ))}
    </p>
  )
}

function LeiCard({ record, source }: { readonly record: LeiRecord; readonly source: LeiSource }) {
  const place = [record.city, record.country].filter(Boolean).join(', ')
  return (
    <div className="biz-lei__card" role="status">
      <div className="biz-lei__head">
        <p
          className={record.language === 'ja' ? 'biz-lei__name jp' : 'biz-lei__name'}
          lang={record.language ?? undefined}
        >
          {record.legalName}
        </p>
        <Badge tone={record.active ? 'active' : 'neutral'}>{record.active ? 'Active' : 'Not active'}</Badge>
      </div>
      {record.otherNames[0] ? <p className="muted">{record.otherNames[0]}</p> : null}
      <p className="biz-lei__meta">
        <span className="mono">{record.lei}</span>
        {place ? ` · ${place}` : ''}
        {record.nextRenewalDate ? ` · renews ${record.nextRenewalDate.slice(0, 10)}` : ''}
      </p>
      <NtaLink record={record} source={source} />
    </div>
  )
}

function LeiResult({ state }: { readonly state: LeiState }) {
  if (state.kind === 'done') return <LeiCard record={state.record} source={state.source} />
  if (state.kind === 'failed') return <ErrorNotice error={state.error} />
  return null
}

interface LeiFormProps {
  readonly value: string
  readonly state: LeiState
  readonly onChange: (value: string) => void
  readonly onLookup: (lei: string) => void
}

function LeiForm({ value, state, onChange, onLookup }: LeiFormProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onLookup(value)
  }
  return (
    <form className="biz-lei__form" onSubmit={submit}>
      <TextField
        label="LEI (Legal Entity Identifier)"
        mono
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="529900R5WX9N2OI2N910"
        error={
          state.kind === 'invalid' ? "That's not a valid LEI: 20 characters, and the check digits must match." : null
        }
        autoComplete="off"
        spellCheck={false}
      />
      <Button type="submit" busy={state.kind === 'loading'}>
        Look up
      </Button>
    </form>
  )
}

/** Any company's LEI, checked against GLEIF; Japanese ones linked to their T-number through the verifier. */
export function LeiWidget() {
  const { state, lookup, source } = useLeiLookup()
  const [value, setValue] = useState('')
  const tryLei = (lei: string) => {
    setValue(lei)
    void lookup(lei)
  }
  return (
    <section className="biz-window window" aria-labelledby="biz-lei">
      <header className="biz-window__head">
        <h2 id="biz-lei" className="biz-window__title">
          Try a global company
        </h2>
        <p className="biz-window__lede">Type any company's LEI, or try one of these.</p>
      </header>
      <div className="biz-lei">
        <LeiForm value={value} state={state} onChange={setValue} onLookup={(lei) => void lookup(lei)} />
        <div className="biz-lei__examples" role="group" aria-label="Examples">
          {LEI_EXAMPLES.map((example) => (
            <button key={example.lei} type="button" className="biz-lei__chip" onClick={() => tryLei(example.lei)}>
              {example.label}
            </button>
          ))}
        </div>
        <p className="biz-lei__source muted">
          {source === 'verifier'
            ? 'Asked through the Meigi verifier: GLEIF, plus the link to a Japanese T-number.'
            : 'Asked GLEIF directly from this page.'}
        </p>
        <LeiResult state={state} />
      </div>
    </section>
  )
}
