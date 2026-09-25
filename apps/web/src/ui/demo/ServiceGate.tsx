import type { ReactNode } from 'react'
import type { Service } from '../../lib/api/services'
import { useServiceStatus } from '../../lib/hooks/useServiceStatus'
import { Spinner } from '../components/Spinner'
import './demo.css'

interface ServiceGateProps {
  readonly service: Service
  /** What to show on the hosted site when the service isn't there. */
  readonly fallback: ReactNode
  readonly children: ReactNode
}

/** Renders the live flow when its service can be used from this page, otherwise the fallback. */
export function ServiceGate({ service, fallback, children }: ServiceGateProps) {
  const status = useServiceStatus(service)
  if (status === 'checking') {
    return (
      <p className="gate__checking">
        <Spinner /> Looking for the Meigi demo machine…
      </p>
    )
  }
  return <>{status === 'up' ? children : fallback}</>
}
