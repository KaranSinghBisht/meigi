import { Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { FujiBackdrop } from '../brand/FujiBackdrop'
import { Spinner } from '../components/Spinner'
import { Footer } from './Footer'
import { Header } from './Header'
import './layout.css'

const TITLES: Record<string, string> = {
  '/': 'Meigi · Pay companies, not addresses.',
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

export function AppShell() {
  useRouteAnnouncements()
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <FujiBackdrop />
      <Header />
      <main id="main" className="shell__main" tabIndex={-1}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
