// Small building blocks shared by the panel's cards: a card, a status chip, text that types in place, a bar.

import type { ReactNode } from 'react'

export type Tone = 'ink' | 'hold' | 'ok' | 'bad' | 'info' | 'muted'

export function Chip({
  tone,
  name,
  children,
}: {
  readonly tone: Tone
  readonly name?: string
  readonly children: ReactNode
}) {
  return (
    <span className={`dchip dchip--${tone}`} data-d={name}>
      <i aria-hidden="true" />
      {children}
    </span>
  )
}

interface CardProps {
  readonly name: string
  readonly title: string
  readonly meta?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}

/** One step's card in the feed. It starts hidden; the timeline brings it in. */
export function Card({ name, title, meta, children, className }: CardProps) {
  return (
    <section className={className ? `pcard ${className}` : 'pcard'} data-d={name} data-enter="">
      <header className="pcard__head">
        <h4 className="pcard__title">{title}</h4>
        {meta ? <p className="pcard__meta">{meta}</p> : null}
      </header>
      {children}
    </section>
  )
}

/** Text that types in without moving anything around it: an invisible copy holds its final size. */
export function Typed({
  name,
  text,
  className,
}: {
  readonly name: string
  readonly text: string
  readonly className?: string
}) {
  return (
    <span className={className ? `typed ${className}` : 'typed'}>
      <span className="typed__ghost" aria-hidden="true">
        {text}
      </span>
      <span className="typed__live" data-d={name} />
    </span>
  )
}

interface BarProps {
  readonly name: string
  readonly label: string
  readonly value: string
  /** 0–1: how far the bar fills. */
  readonly fill: number
  readonly tone?: Tone
}

export function Bar({ name, label, value, fill, tone = 'hold' }: BarProps) {
  return (
    <div className={`pbar pbar--${tone}`}>
      <p className="pbar__label">
        <span>{label}</span>
        <b className="pbar__value" data-d={`${name}-value`} data-enter="">
          {value}
        </b>
      </p>
      <span className="pbar__track">
        <span className="pbar__fill" data-d={`${name}-fill`} data-fill={Math.min(Math.max(fill, 0), 1)} />
      </span>
    </div>
  )
}

export function Field({
  label,
  name,
  children,
}: {
  readonly label: string
  readonly name: string
  readonly children: ReactNode
}) {
  return (
    <div className="pfield">
      <dt>{label}</dt>
      <dd>
        <span className="pfield__slot" data-d={`${name}-slot`} />
        <span className="pfield__value" data-d={name} data-enter="">
          {children}
        </span>
      </dd>
    </div>
  )
}

interface SceneProps {
  readonly id: string
  readonly steps: readonly string[]
  readonly hidden?: boolean
  /** What the feed shows before its first card. */
  readonly idle?: ReactNode
  readonly children: ReactNode
}

/** One run in the panel: its pipeline steps along the top and a feed of cards that scrolls as they arrive. */
export function Scene({ id, steps, hidden = false, idle, children }: SceneProps) {
  return (
    <section className="pscene" data-d={`scene-${id}`} data-enter={hidden ? '' : undefined}>
      <ol className="psteps">
        {steps.map((label, index) => (
          <li key={label} className="pstep" data-d={`${id}-step-${index + 1}`}>
            <i className="pstep__dot" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ol>
      <div className="pfeed" data-d={`${id}-view`}>
        {idle ? (
          <div className="pidle" data-d={`${id}-idle`}>
            {idle}
          </div>
        ) : null}
        <div className="pfeed__stack" data-d={`${id}-stack`}>
          {children}
        </div>
      </div>
    </section>
  )
}
