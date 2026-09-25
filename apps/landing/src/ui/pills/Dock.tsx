import { env } from '../../lib/env/env'
import { ResolvePopover } from '../resolve/ResolvePopover'
import { StatusPill } from '../status/StatusPill'
import { CopyPill } from './CopyPill'
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
        <CopyPill label="x402 guard" text="npm i @meigi/x402-guard" />
      </nav>
    </footer>
  )
}
