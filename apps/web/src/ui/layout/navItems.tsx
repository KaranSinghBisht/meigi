import { NavLink } from 'react-router'
import { NavIcon, type NavIconName } from './navIcons'

interface NavItem {
  readonly to: string
  readonly label: string
  readonly icon: NavIconName
  /** A small tag after the label */
  readonly hint?: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/start', label: 'Overview', icon: 'overview' },
  { to: '/try', label: 'Try it', icon: 'try' },
  { to: '/agent', label: 'AP agent', icon: 'agent' },
  { to: '/registry', label: 'Payees', icon: 'payees' },
  { to: '/register', label: 'Register', icon: 'register' },
  { to: '/change', label: 'Payout changes', icon: 'changes' },
  { to: '/x402', label: 'Agent payments', icon: 'payments', hint: 'x402' },
  { to: '/business', label: 'For business', icon: 'business' },
]

/** The destination a path belongs to: its own page or one below it, like /registry/T2011001234567. */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
}

/** The app's destinations as icon + label links; the current one reads as a translucent pill. */
export function NavList({ className, onNavigate }: { readonly className: string; readonly onNavigate?: () => void }) {
  return (
    <ul className={className}>
      {NAV_ITEMS.map((item) => (
        <li key={item.to}>
          <NavLink to={item.to} className="side-link" onClick={onNavigate}>
            <NavIcon name={item.icon} />
            <span className="side-link__label">{item.label}</span>
            {item.hint ? <span className="side-link__hint">{item.hint}</span> : null}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
