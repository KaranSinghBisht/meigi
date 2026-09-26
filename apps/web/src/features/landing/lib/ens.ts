// Resolves t<13 digits>.payee.eth the way any ENS-aware wallet does: stock viem against Sepolia's default Universal
// Resolver, which hands the name to Meigi's PayeeResolver, which answers from the registry at lookup time. This
// module pulls in viem, so UI code loads it with a dynamic import.

import { BaseError, HttpRequestError, TimeoutError, createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import type { HexAddress } from './config'

/**
 * What ENS publishes for a T-number. Only an active payee resolves to an address and publishes its name; a disputed
 * one publishes its status and nothing else, and a queued payout change shows as a date, never as an address.
 */
export type EnsPayee =
  | {
      readonly kind: 'active'
      readonly legalName: string
      readonly payout: HexAddress
      readonly changePendingUntil: Date | null
    }
  | { readonly kind: 'disputed' }
  | { readonly kind: 'not-registered' }

/** Sepolia couldn't be reached, or ENS answered with something unusable. */
export type EnsFailure = 'network' | 'ens'

function makeClient(rpcUrl: string) {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 12_000, retryCount: 1, batch: true }),
  })
}

const clients = new Map<string, ReturnType<typeof makeClient>>()

function clientFor(rpcUrl: string) {
  const existing = clients.get(rpcUrl)
  if (existing) return existing
  const client = makeClient(rpcUrl)
  clients.set(rpcUrl, client)
  return client
}

/** `meigi.changePending` is "true" while a payout change waits out its timelock; `meigi.effectiveAt` is when it lands. */
function pendingUntil(pending: string | null, effectiveAt: string | null): Date | null {
  if (pending !== 'true' || !effectiveAt) return null
  const seconds = Number(effectiveAt)
  return Number.isSafeInteger(seconds) && seconds > 0 ? new Date(seconds * 1000) : null
}

export async function resolvePayee(rpcUrl: string, name: string): Promise<EnsPayee> {
  const client = clientFor(rpcUrl)
  const text = (key: string) => client.getEnsText({ name, key })
  const [status, payout, legalName, pending, effectiveAt] = await Promise.all([
    text('meigi.status'),
    client.getEnsAddress({ name }),
    text('name'),
    text('meigi.changePending'),
    text('meigi.effectiveAt'),
  ])
  if (status === 'disputed') return { kind: 'disputed' }
  if (status !== 'active' || !payout || !legalName) return { kind: 'not-registered' }
  return { kind: 'active', legalName, payout, changePendingUntil: pendingUntil(pending, effectiveAt) }
}

export function classifyEnsError(error: unknown): EnsFailure {
  if (error instanceof BaseError) {
    const offline = error.walk((cause) => cause instanceof HttpRequestError || cause instanceof TimeoutError)
    return offline ? 'network' : 'ens'
  }
  return 'network'
}
