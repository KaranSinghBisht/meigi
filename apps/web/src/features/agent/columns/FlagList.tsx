import type { Severity } from '../../../lib/api/agentTypes'
import { TokenText } from '../../../ui/components/TokenText'
import './columns.css'

interface Item {
  readonly code: string
  readonly severity: Severity
  readonly message: string
  readonly evidence?: string | null
}

/** Blocking items first; each says in words why it matters. */
export function FlagList({ items, limit = 4 }: { readonly items: readonly Item[]; readonly limit?: number }) {
  if (items.length === 0) return null
  const sorted = [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'block' ? -1 : 1))
  const shown = sorted.slice(0, limit)
  return (
    <ul className="flags">
      {shown.map((item, index) => (
        <li key={`${item.code}-${index}`} className={`flags__item flags__item--${item.severity}`}>
          <span className="flags__sev">{item.severity === 'block' ? 'Blocks' : 'Note'}</span>
          <span className="flags__msg">
            <TokenText text={item.message} />
          </span>
          {item.evidence ? <q className="flags__evidence">{item.evidence}</q> : null}
        </li>
      ))}
      {sorted.length > shown.length ? <li className="flags__more">+{sorted.length - shown.length} more</li> : null}
    </ul>
  )
}
