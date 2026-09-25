import type { ReactNode } from 'react'
import './feedback.css'

export type BadgeTone = 'active' | 'disputed' | 'neutral' | 'pending' | 'info'

export function Badge({ tone = 'neutral', children }: { readonly tone?: BadgeTone; readonly children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}
