import type { ReactNode } from 'react'
import { Link } from 'react-router'
import './try.css'

export interface CheckLink {
  readonly label: string
  /** An app route (starts with "/") or an https: address. */
  readonly href: string
}

interface TryCheckProps {
  readonly step: number
  readonly title: string
  /** One line: what this check proves. */
  readonly proves: string
  /** A live status: a chip and a short fact, read from the chain as the page opens. */
  readonly status?: ReactNode
  readonly links: readonly CheckLink[]
}

function CheckAnchor({ link }: { readonly link: CheckLink }) {
  if (link.href.startsWith('/')) {
    return (
      <Link className="try-check__link" to={link.href}>
        {link.label} <span aria-hidden="true">→</span>
      </Link>
    )
  }
  return (
    <a className="try-check__link" href={link.href} target="_blank" rel="noreferrer">
      {link.label} <span aria-hidden="true">↗</span>
    </a>
  )
}

/** One numbered check: what it proves, where to see it, and (where the chain can say) whether it is live. */
export function TryCheck({ step, title, proves, status, links }: TryCheckProps) {
  return (
    <li className="try-check">
      <span className="try-check__step" aria-hidden="true">
        {step}
      </span>
      <div className="try-check__body">
        <h2 className="try-check__title">{title}</h2>
        <p className="try-check__proves">{proves}</p>
        {status ? <div className="try-check__status">{status}</div> : null}
        <p className="try-check__links">
          {links.map((link) => (
            <CheckAnchor key={link.href} link={link} />
          ))}
        </p>
      </div>
    </li>
  )
}
