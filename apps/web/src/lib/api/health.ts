// Is a service there? Asked once per page load, and only when the answer can matter: a public page never
// probes a loopback service, because browsers ask visitors for local-network access when a site does that.

import { SERVICES, type Service } from './services'

const LOOPBACK = /^(localhost|127(\.\d+){3}|\[::1\])$/

function loopback(url: string): boolean {
  try {
    return LOOPBACK.test(new URL(url).hostname)
  } catch {
    return false
  }
}

const probes = new Map<Service, Promise<boolean>>()

async function probe(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4_000) })
    return response.ok
  } catch {
    return false // not running, blocked by CORS, or too slow: all mean "not usable from this page"
  }
}

export function isReachable(service: Service): Promise<boolean> {
  const url = SERVICES[service].url
  if (loopback(url) && !loopback(window.location.origin)) return Promise.resolve(false)
  let pending = probes.get(service)
  if (!pending) {
    pending = probe(url)
    probes.set(service, pending)
  }
  return pending
}
