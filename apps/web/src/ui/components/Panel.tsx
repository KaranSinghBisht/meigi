import type { HTMLAttributes, ReactNode } from 'react'
import './panel.css'

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly title?: ReactNode
  readonly eyebrow?: ReactNode
  readonly actions?: ReactNode
  /** Heading level for the title (defaults to h2). */
  readonly level?: 2 | 3
  readonly as?: 'section' | 'article' | 'div'
}

/** A frosted card. With a title it becomes a labelled region. */
export function Panel({
  title,
  eyebrow,
  actions,
  level = 2,
  as = 'section',
  className,
  children,
  ...rest
}: PanelProps) {
  const Tag = as
  const Heading = level === 2 ? 'h2' : 'h3'
  const hasHeader = Boolean(title || eyebrow || actions)
  return (
    <Tag {...rest} className={className ? `panel ${className}` : 'panel'}>
      {hasHeader ? (
        <header className="panel__header">
          <div className="panel__titles">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <Heading className="panel__title">{title}</Heading> : null}
          </div>
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </Tag>
  )
}
