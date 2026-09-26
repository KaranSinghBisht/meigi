// The landing hero's settings, read from the app's env (the app and the hero now ship as one build).

import { env, type HexAddress } from '../../../lib/env/env'

export type { HexAddress }

export interface RegistryConfig {
  readonly rpcUrl: string
  readonly address: HexAddress
  /** First block to scan for PayeeRegistered logs (the deployment block). */
  readonly fromBlock: bigint | null
}

export const landingConfig = {
  githubUrl: env.githubUrl,
  docsUrl: env.docsUrl,
  registry: { rpcUrl: env.rpcUrl, address: env.registry, fromBlock: env.registryFromBlock } as RegistryConfig,
} as const
