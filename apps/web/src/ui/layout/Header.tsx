import { Link, NavLink } from 'react-router'
import { HankoMark } from '../brand/HankoMark'
import { WalletButton } from './WalletButton'
import './layout.css'

const LINKS = [
  { to: '/agent', label: 'Agent console' },
  { to: '/registry', label: 'Registry' },
  { to: '/register', label: 'Register' },
  { to: '/change', label: 'Changes' },
  { to: '/x402', label: 'x402' },
] as const

export function Header() {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <Link to="/" className="brand" aria-label="Meigi home: back to the lake">
          <HankoMark size={34} />
          <span className="brand__word" aria-hidden="true">
            meigi.
          </span>
        </Link>
        <nav className="nav" aria-label="Main">
          <ul className="nav__list">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} className="nav__link">
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="topbar__end">
          <span className="chain-pill" title="All reads and writes use Ethereum Sepolia (11155111)">
            Sepolia
          </span>
          <WalletButton />
        </div>
      </div>
    </header>
  )
}
