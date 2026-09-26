import type { ReactNode } from 'react'
import { ONBOARD_STEPS } from '../../content/onboard'

interface ScreenProps {
  readonly n: number
  readonly title: string
  readonly lede: string
  readonly children: ReactNode
}

/** One wizard screen: "Step n of 7", its question and lede, then its content. Only the first starts visible. */
export function Screen({ n, title, lede, children }: ScreenProps) {
  return (
    <section className="onb__screen" data-d={`onb-screen-${n}`} data-enter={n === 1 ? undefined : ''}>
      <p className="onb__eyebrow">
        Step {n} of {ONBOARD_STEPS.length}
      </p>
      <h3 className="onb__title">{title}</h3>
      <p className="onb__lede">{lede}</p>
      {children}
    </section>
  )
}

export function Next({ n, label = 'Continue' }: { readonly n: number; readonly label?: string }) {
  return (
    <span className="btn btn--primary btn--md onb__next" data-d={`onb-next-${n}`}>
      {label}
    </span>
  )
}
