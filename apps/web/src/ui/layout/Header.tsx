import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { HankoMark } from '../brand/HankoMark'
import { NavIcon } from './navIcons'
import { NavList, navItemFor } from './navItems'
import { WalletButton } from './WalletButton'
import './layout.css'
import './nav.css'

/** Closes the sheet on Escape (focus goes back to the menu button) or on a press anywhere outside the bar. */
function useDismiss(
  open: boolean,
  close: () => void,
  bar: RefObject<HTMLElement | null>,
  button: RefObject<HTMLButtonElement | null>,
): void {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      button.current?.focus()
    }
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && !bar.current?.contains(event.target)) close()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPress)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [open, close, bar, button])
}

/**
 * Navigation below 1280 px (tablets, phones), where the sidebar would crowd the page: a compact glass bar with the
 * mark, the current section and a menu button that drops a glass sheet over the page with every destination, the
 * network and the wallet. The sheet belongs to the page it was opened on, so any navigation closes it.
 */
export function Header() {
  const { pathname } = useLocation()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const close = useCallback(() => setOpenOn(null), [])
  const bar = useRef<HTMLElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useDismiss(open, close, bar, button)
  const current = navItemFor(pathname)
  return (
    <header className="topbar" ref={bar}>
      <div className="topbar__inner lg-lens">
        <Link to="/" className="brand" aria-label="Meigi home: back to the lake">
          <HankoMark size={30} />
          <span className="brand__word" aria-hidden="true">
            meigi.
          </span>
        </Link>
        <span className="topbar__title">{current?.label}</span>
        <button
          ref={button}
          type="button"
          className="menu-button"
          aria-expanded={open}
          aria-controls={open ? 'app-menu' : undefined}
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          <NavIcon name={open ? 'close' : 'menu'} />
          <span className="sr-only">{open ? 'Close menu' : 'Menu'}</span>
        </button>
      </div>
      {open ? (
        <div id="app-menu" className="menu-sheet">
          <nav aria-label="Main">
            <NavList className="menu-sheet__list" onNavigate={close} />
          </nav>
          <div className="menu-sheet__end">
            <span className="chain-pill" title="All reads and writes use Ethereum Sepolia (11155111)">
              Sepolia
            </span>
            <WalletButton />
          </div>
        </div>
      ) : null}
    </header>
  )
}
