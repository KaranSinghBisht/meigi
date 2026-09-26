import { Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { VerticalLabel } from '../brand/VerticalLabel'
import { Spinner } from '../components/Spinner'
import { Arrival } from '../stage/Arrival'
import { SceneLayer } from '../stage/SceneLayer'
import { Footer } from './Footer'
import { Header } from './Header'
import './layout.css'

const TITLES: Record<string, string> = {
  '/': 'Meigi · Pay companies, not addresses.',
  '/start': 'Start · Meigi',
  '/agent': 'Agent console · Meigi',
  '/registry': 'Registry · Meigi',
  '/register': 'Register a business · Meigi',
  '/change': 'Company changes · Meigi',
  '/x402': 'x402 guard · Meigi',
}

/** Keeps the document title in step with the route and moves focus to the page on navigation. */
function useRouteAnnouncements() {
  const { pathname } = useLocation()
  const firstRender = useRef(true)
  useEffect(() => {
    const root = `/${pathname.split('/')[1] ?? ''}`
    document.title = TITLES[root] ?? 'Meigi'
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

/** "/" is the landing hero: only the world and its overlay. Entering from it, the app's chrome fades in. */
function useShellMode() {
  const { pathname, state } = useLocation()
  const hero = pathname === '/'
  const entered = !hero && (state as { entered?: boolean } | null)?.entered === true
  return { hero, className: hero ? 'shell shell--hero' : entered ? 'shell shell--entered' : 'shell' }
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
