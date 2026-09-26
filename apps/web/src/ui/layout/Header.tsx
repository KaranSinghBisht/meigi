import { useRef } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { HankoMark } from '../brand/HankoMark'
import { useCurrentInView, useScrollFade } from '../components/useScrollFade'
import { WalletButton } from './WalletButton'
import './layout.css'

const LINKS = [
  { to: '/agent', label: 'Agent console' },
  { to: '/registry', label: 'Registry' },
  { to: '/register', label: 'Register' },
  { to: '/change', label: 'Changes' },
  { to: '/x402', label: 'x402' },
  { to: '/business', label: 'For business' },
] as const

/** The page links. On a narrow screen they form a tab strip that scrolls sideways, keeps the current page in view
    and fades whichever edge hides more links. */
function Nav() {
  const list = useRef<HTMLUListElement>(null)
  const { pathname } = useLocation()
  useScrollFade(list)
  useCurrentInView(list, pathname)
  return (
    <nav className="nav" aria-label="Main">
      <ul ref={list} className="nav__list scroll-fade">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} className="nav__link">
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function Header() {
  return (
    <header className="topbar">
      <div className="topbar__inner lg-lens">
        <Link to="/" className="brand" aria-label="Meigi home: back to the lake">
          <HankoMark size={34} />
          <span className="brand__word" aria-hidden="true">
            meigi.
          </span>
        </Link>
        <Nav />
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
