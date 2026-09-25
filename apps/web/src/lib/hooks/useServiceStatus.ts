import { useEffect, useState } from 'react'
import { isReachable } from '../api/health'
import type { Service } from '../api/services'
import { env } from '../env/env'

export type ServiceStatus = 'checking' | 'up' | 'down'

/**
 * Locally the service is assumed to be there, and a failure is explained where it happens. On the hosted
 * site it is asked first, so a missing demo machine shows a calm panel instead of an error.
 */
export function useServiceStatus(service: Service): ServiceStatus {
  const [status, setStatus] = useState<ServiceStatus>(env.hosted ? 'checking' : 'up')
  useEffect(() => {
    if (!env.hosted) return
    let live = true
    void isReachable(service).then((ok) => {
      if (live) setStatus(ok ? 'up' : 'down')
    })
    return () => {
      live = false
    }
  }, [service])
  return status
}
