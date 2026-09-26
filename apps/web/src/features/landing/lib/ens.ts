// Resolves t<13 digits>.payee.eth the way a standard ENS client does: stock viem against Sepolia's default Universal
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

/** A name a company issued under its payee name, e.g. ap.t2011001234567.payee.eth. */
const ISSUED = /^([a-z0-9-]+)\.t(\d{13})\.payee\.eth$/

/** An issued name that answers: text-only, so it is never a payee and has no address. */
export interface IssuedEnsName {
  readonly name: string
  /** ENSIP-27, as the name publishes it: "Agent", "Workgroup" or "Person". */
  readonly nameClass: string | null
  /** The issuing company's registered name, from its payee name; null if that doesn't answer. */
  readonly company: string | null
  /** The issuing company's T-number, e.g. T2011001234567. */
  readonly tNumber: string
}

/**
 * The issued name `name` as stock viem reads it, or null when it isn't one or doesn't answer right now (then it
 * publishes nothing). Its company comes from the parent payee name, which the registry answers.
 */
export async function resolveIssued(rpcUrl: string, name: string): Promise<IssuedEnsName | null> {
  const digits = ISSUED.exec(name)?.[2]
  if (!digits) return null
  const client = clientFor(rpcUrl)
  const [nameClass, description, company] = await Promise.all([
    client.getEnsText({ name, key: 'class' }),
    client.getEnsText({ name, key: 'description' }),
    client.getEnsText({ name: `t${digits}.payee.eth`, key: 'name' }),
  ])
  if (!nameClass && !description) return null
  return { name, nameClass: nameClass ?? null, company: company ?? null, tNumber: `T${digits}` }
}

export function classifyEnsError(error: unknown): EnsFailure {
  if (error instanceof BaseError) {
    const offline = error.walk((cause) => cause instanceof HttpRequestError || cause instanceof TimeoutError)
    return offline ? 'network' : 'ens'
  }
  return 'network'
}
