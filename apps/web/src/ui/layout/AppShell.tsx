import { Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { VerticalLabel } from '../brand/VerticalLabel'
import { Spinner } from '../components/Spinner'
import { Arrival } from '../stage/Arrival'
import { SceneLayer } from '../stage/SceneLayer'
import { GlassFilters } from '../styles/GlassFilters'
import { Footer } from './Footer'
import { Header } from './Header'
import { navItemFor } from './navItems'
import { Sidebar } from './Sidebar'
import './layout.css'

/** Names the tab after the sidebar entry for the route and moves focus to the page on navigation. */
function useRouteAnnouncements() {
  const { pathname } = useLocation()
  const firstRender = useRef(true)
  useEffect(() => {
    const item = navItemFor(pathname)
    document.title = pathname === '/' ? 'Meigi · Pay companies, not addresses.' : item ? `${item.label} · Meigi` : 'Meigi'
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo({ top: 0 })
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])
}

export function RouteFallback() {
  return (
    <div className="route-fallback">
      <Spinner label="Loading page" />
    </div>
  )
}

/**
 * "/" is the landing hero: only the world and its overlay. Every other page is the app: the glass sidebar (or, below
 * 1280 px, the compact bar) beside the page. Entering from the hero, the app's chrome fades in.
 */
function useShellMode() {
  const { pathname, state } = useLocation()
  const hero = pathname === '/'
  const entered = !hero && (state as { entered?: boolean } | null)?.entered === true
  return { hero, className: hero ? 'shell shell--hero' : entered ? 'shell shell--app shell--entered' : 'shell shell--app' }
}

export function AppShell() {
  useRouteAnnouncements()
  const { hero, className } = useShellMode()
  return (
    <div className={className}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SceneLayer />
      <GlassFilters />
      {hero ? null : <Sidebar />}
      {hero ? null : <Header />}
      {hero ? null : (
        <div className="shell__vlabel" aria-hidden="true">
          <VerticalLabel />
        </div>
      )}
      <main id="main" className="shell__main" tabIndex={-1}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      {hero ? null : <Footer />}
      <Arrival />
    </div>
  )
}
