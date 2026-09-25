// The one read-only Sepolia client. Contract reads are batched into multicalls, and requests made in the
// same tick (e.g. block timestamps for the feed) into one JSON-RPC batch.

import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { env } from '../env/env'

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(env.rpcUrl, { timeout: 15_000, retryCount: 2, batch: { batchSize: 20 } }),
  batch: { multicall: true },
})

export type ReadClient = typeof publicClient
