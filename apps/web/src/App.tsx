import { lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { WalletProvider } from './lib/chain/WalletContext'
import { HomePage } from './features/home/HomePage'
import { NotFoundPage, RouteErrorPage } from './features/home/NotFoundPage'
import { AppShell } from './ui/layout/AppShell'

// Each flow is its own chunk; World ID (IDKit + WASM) only loads with /register and /change.
const AgentPage = lazy(() => import('./features/agent/AgentPage'))
const RegistryPage = lazy(() => import('./features/registry/RegistryPage'))
const RegisterPage = lazy(() => import('./features/register/RegisterPage'))
const ChangePage = lazy(() => import('./features/change/ChangePage'))
const X402Page = lazy(() => import('./features/x402/X402Page'))

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'agent', element: <AgentPage /> },
      { path: 'registry', element: <RegistryPage /> },
      { path: 'registry/:tNumber', element: <RegistryPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'change', element: <ChangePage /> },
      { path: 'change/:tNumber', element: <ChangePage /> },
      { path: 'x402', element: <X402Page /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return (
    <WalletProvider>
      <RouterProvider router={router} />
    </WalletProvider>
  )
}
