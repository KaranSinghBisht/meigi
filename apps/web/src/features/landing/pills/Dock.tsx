import { Link } from 'react-router'
import { landingConfig as env } from '../lib/config'
import { ResolvePopover } from '../resolve/ResolvePopover'
import { StatusPill } from '../status/StatusPill'
import { ArrowUpRight } from './icons'
import './pills.css'

function ExternalPill({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <a className="pill" href={href} target="_blank" rel="noopener noreferrer">
      {label}
      <ArrowUpRight />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

/** Bottom bar: live registry status on the left, links and tools on the right. */
export function Dock() {
  return (
    <footer className="dock">
      <StatusPill />
      <nav className="dock__pills" aria-label="Meigi links and tools">
        {env.githubUrl && <ExternalPill href={env.githubUrl} label="GitHub" />}
        {env.docsUrl && <ExternalPill href={env.docsUrl} label="Docs" />}
        <ResolvePopover />
        {/* The guard is a workspace package in the repo, not on npm yet, so the pill opens its page instead of an install line. */}
        <Link className="pill" to="/x402">
          x402 guard
        </Link>
      </nav>
    </footer>
  )
}
