// The three local services the app talks to, with how to start each one. None of them runs on the public
// site: they hold keys (the attester, the agent, the x402 buyer), so they stay on the demo machine.

import { env } from '../env/env'

export type Service = 'verifier' | 'agent' | 'merchant'

export interface ServiceInfo {
  readonly name: string
  readonly url: string
  readonly start: string
}

export const SERVICES: Record<Service, ServiceInfo> = {
  verifier: { name: 'verifier', url: env.verifierUrl, start: 'pnpm --filter @meigi/verifier start' },
  agent: { name: 'AP agent', url: env.agentUrl, start: 'pnpm --filter @meigi/agent start' },
  merchant: { name: 'x402 merchant', url: env.merchantUrl, start: 'pnpm --filter @meigi/x402-demo start' },
}
