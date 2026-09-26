import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { WalletProvider } from './lib/chain/WalletContext'
import { HomePage } from './features/home/HomePage'
import { NotFoundPage, RouteErrorPage } from './features/home/NotFoundPage'
import { AppShell, RouteFallback } from './ui/layout/AppShell'

// Each flow is its own chunk; World ID (IDKit + WASM) only loads with /register and /change, and the landing
// hero (with gsap) only with "/".
const LandingPage = lazy(() => import('./features/landing/LandingPage'))
const AgentPage = lazy(() => import('./features/agent/AgentPage'))
const RegistryPage = lazy(() => import('./features/registry/RegistryPage'))
const RegisterPage = lazy(() => import('./features/register/RegisterPage'))
const ChangePage = lazy(() => import('./features/change/ChangePage'))
const X402Page = lazy(() => import('./features/x402/X402Page'))
const BusinessPage = lazy(() => import('./features/business/BusinessPage'))
const TryPage = lazy(() => import('./features/try/TryPage'))
const DemoPage = lazy(() => import('./features/demo/DemoPage'))

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'start', element: <HomePage /> },
      { path: 'agent', element: <AgentPage /> },
      { path: 'registry', element: <RegistryPage /> },
      { path: 'registry/:tNumber', element: <RegistryPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'change', element: <ChangePage /> },
      { path: 'change/:tNumber', element: <ChangePage /> },
      { path: 'x402', element: <X402Page /> },
      { path: 'business', element: <BusinessPage /> },
      { path: 'try', element: <TryPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // The recorded demo player, full-bleed with no header or footer: the video and the booth screen.
  {
    path: 'demo',
    errorElement: <RouteErrorPage />,
    element: (
      <Suspense fallback={<RouteFallback />}>
        <DemoPage />
      </Suspense>
    ),
  },
])

export function App() {
  return (
    <WalletProvider>
      <RouterProvider router={router} />
    </WalletProvider>
  )
}
