import { useId, type ReactNode } from 'react'
import './pipeline.css'
import './columns.css'

export type ColumnTone = 'neutral' | 'ok' | 'hold' | 'muted' | 'belief'

interface ColumnProps {
  readonly step: number
  readonly title: string
  readonly tag: string
  readonly tone?: ColumnTone
  readonly status?: ReactNode
  readonly children: ReactNode
}

/** One stage of the pipeline, numbered in the order the agent runs them. */
export function Column({ step, title, tag, tone = 'neutral', status, children }: ColumnProps) {
  const id = useId()
  return (
    <section className={`col col--${tone}`} aria-labelledby={id}>
      <header className="col__head">
        <span className="col__step" aria-hidden="true">
          {step}
        </span>
        <div className="col__titles">
          <h3 id={id} className="col__title">
            {title}
          </h3>
          <p className="col__tag">{tag}</p>
        </div>
      </header>
      {status ? <div className="col__status">{status}</div> : null}
      <div className="col__body">{children}</div>
    </section>
  )
}

interface BarProps {
  readonly label: string
  readonly value: number
  readonly max?: number
  readonly display: string
  readonly danger?: boolean
}

/** A labelled 0..max meter; red when the value is a risk signal above its threshold. */
export function Bar({ label, value, max = 1, display, danger = false }: BarProps) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100
  return (
    <div className={danger ? 'bar bar--danger' : 'bar'}>
      <div className="bar__row">
        <span className="bar__label">{label}</span>
        <span className="bar__value">{display}</span>
      </div>
      <div
        className="bar__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="bar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** A short label/value pair inside a column. */
export function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="fact">
      <p className="fact__label">{label}</p>
      <div className="fact__value">{children}</div>
    </div>
  )
}
