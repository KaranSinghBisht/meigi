import { Link } from 'react-router'
import { HankoMark } from '../brand/HankoMark'
import { NavList } from './navItems'
import { WalletButton } from './WalletButton'
import './layout.css'
import './nav.css'

/**
 * Desktop navigation (≥ 1280 px): one floating frosted-glass window down the left edge, over the world. The Meigi
 * mark at the top, the destinations as icon + label, and the network and wallet at the foot.
 */
export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link to="/" className="brand sidebar__brand" aria-label="Meigi home: back to the lake">
        <HankoMark size={34} />
        <span className="brand__word" aria-hidden="true">
          meigi.
        </span>
      </Link>
      <nav className="sidebar__nav" aria-label="Main">
        <NavList className="sidebar__list" />
      </nav>
      <div className="sidebar__end">
        <span className="chain-pill" title="All reads and writes use Ethereum Sepolia (11155111)">
          Sepolia
        </span>
        <WalletButton />
      </div>
    </aside>
  )
}
