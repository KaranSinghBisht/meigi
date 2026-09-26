// The withdrawal check: an exchange (or a wallet) is about to send a customer's withdrawal to an address the customer
// says is a company's payout. The match itself is decided by the x402 guard's own checkPayee, with the company's
// ENS name declared, so the registry and ENS both have to agree and the site answers exactly as the guard does.
// Around it this module adds what an exchange also has to know before it releases funds: whether the T-number is
// unregistered or disputed (the guard reports both as "not active"), and whether a payout change is queued, in which
// case it holds, whatever the destination, until the change lands. The queued address itself is never read.

import { checkPayee, type GuardDeps } from '@meigi/x402-guard'
import { getAddress, isAddress } from 'viem'
import { readPayee, resolveEnsAddress, type PayeeSnapshot } from '../../lib/chain/registry'
import type { ParsedTNumber } from '../../lib/chain/tNumber'
import { env, type HexAddress } from '../../lib/env/env'
import { resolvePayee, type EnsPayee } from '../landing/lib/ens'

/** The one network the registry vouches for. */
const NETWORK = 'eip155:11155111'
const ZERO: HexAddress = '0x0000000000000000000000000000000000000000'

export type Destination =
  | { readonly kind: 'address'; readonly address: HexAddress }
  | { readonly kind: 'name'; readonly name: string }

/**
 * Why a destination doesn't match: it is another address (the registry and ENS both name the registered payout), a
 * name that doesn't resolve, or ENS disagrees with the registry (hold, and check the directory before anything else).
 */
export type MismatchReason = 'different' | 'unresolved' | 'ens'

export type Verdict =
  | { readonly kind: 'match'; readonly target: ParsedTNumber; readonly legalName: string; readonly payout: HexAddress }
  | {
      readonly kind: 'mismatch'
      readonly target: ParsedTNumber
      readonly legalName: string
      readonly payout: HexAddress
      /** Where the customer asked to send it (null when a name didn't resolve). Never presented as correct. */
      readonly asked: HexAddress | null
      readonly reason: MismatchReason
    }
  | { readonly kind: 'unregistered'; readonly target: ParsedTNumber }
  | { readonly kind: 'pending'; readonly target: ParsedTNumber; readonly legalName: string; readonly landsAt: Date }
  | { readonly kind: 'disputed'; readonly target: ParsedTNumber; readonly resolvesAt: Date | null }

const NAME_RE = /^(?:[a-z0-9-]+\.)+eth$/

/** An address (any case), or an ENS name such as t2011001234567.payee.eth. Full-width IME input is folded first. */
export function parseDestination(input: string): Destination | null {
  const value = input.normalize('NFKC').trim()
  if (isAddress(value, { strict: false })) return { kind: 'address', address: getAddress(value) }
  const name = value.toLowerCase()
  return NAME_RE.test(name) ? { kind: 'name', name } : null
}

/**
 * What the guard reads: this payee as the registry holds it right now, and ENS as any wallet resolves it. The
 * T-number's own name is answered from the ENS read already made for it; any other name is resolved afresh.
 */
function guardDeps(snapshot: PayeeSnapshot, target: ParsedTNumber, ens: EnsPayee): GuardDeps {
  return {
    network: NETWORK,
    payee: async () => ({ status: 1, legalName: snapshot.legalName, payout: snapshot.payout ?? ZERO }),
    resolveEns: async (name) => {
      if (name !== target.ens) return resolveEnsAddress(name)
      return ens.kind === 'active' ? ens.payout : null
    },
  }
}

async function destinationAddress(destination: Destination): Promise<HexAddress | null> {
  return destination.kind === 'address' ? destination.address : resolveEnsAddress(destination.name)
}

/** The verdict for sending to `destination` as a payment to `target`. Throws only when Sepolia can't be read. */
export async function checkWithdrawal(target: ParsedTNumber, destination: Destination): Promise<Verdict> {
  const [snapshot, ens, asked] = await Promise.all([
    readPayee(target),
    resolvePayee(env.rpcUrl, target.ens),
    destinationAddress(destination),
  ])
  if (snapshot.status === 'unregistered') return { kind: 'unregistered', target }
  if (snapshot.status === 'disputed') return { kind: 'disputed', target, resolvesAt: snapshot.disputeResolvesAt }
  const { legalName } = snapshot
  if (snapshot.payoutChangeLandsAt) return { kind: 'pending', target, legalName, landsAt: snapshot.payoutChangeLandsAt }
  const payout = snapshot.payout ?? ZERO
  if (!asked) return { kind: 'mismatch', target, legalName, payout, asked: null, reason: 'unresolved' }
  const verdict = await checkPayee(
    guardDeps(snapshot, target, ens),
    { tNumber: target.display, ens: target.ens },
    { payTo: asked, network: NETWORK },
  )
  if (verdict.ok) return { kind: 'match', target, legalName, payout }
  const ensAgrees = ens.kind === 'active' && getAddress(ens.payout) === getAddress(payout)
  return { kind: 'mismatch', target, legalName, payout, asked, reason: ensAgrees ? 'different' : 'ens' }
}
