// Live reads of the PayeeRegistry. A queued payout (or controller) is reported only as "pending until",
// never as an address: until it lands, nobody should pay it, so the UI never gets to see it. A disputed payee's
// name isn't returned either, so the explorer shows only its status, as the ENS resolver publishes only the status.
// (The registry itself still holds the name on-chain: this is what Meigi shows, not a privacy guarantee.)

import { payeeRegistryAbi } from '@meigi/abi'
import { keccak256, stringToHex, type Hex } from 'viem'
import { env, type HexAddress } from '../env/env'
import { publicClient } from './client'
import type { ParsedTNumber } from './tNumber'

export type PayeeStatus = 'unregistered' | 'active' | 'disputed'

export interface PayeeSnapshot {
  readonly tNumber: ParsedTNumber
  readonly status: PayeeStatus
  /** The registered name; empty unless active (the explorer doesn't show a disputed payee's name). */
  readonly legalName: string
  readonly controller: HexAddress | null
  /** The payout the registry pays today; null unless active (disputed payees are frozen). */
  readonly payout: HexAddress | null
  readonly payoutChangeLandsAt: Date | null
  readonly rotationLandsAt: Date | null
  readonly disputeResolvesAt: Date | null
  readonly threshold: number
  readonly officerCount: number
  /** Its only officer is the demo seed's placeholder, which no one can prove: the company can't redirect its payout. */
  readonly placeholderOfficer: boolean
  readonly nonce: bigint
  readonly evidence: Hex
  /** The registry's public timelock for money-moving changes (72 h in production). */
  readonly changeDelaySeconds: number
  readonly readAt: Date
}

const STATUS: Record<number, PayeeStatus> = { 0: 'unregistered', 1: 'active', 2: 'disputed' }
/** The officer the demo seed enrols for its fictional companies: no World ID session proves it (seed-demo.sh). */
const PLACEHOLDER_OFFICER = keccak256(stringToHex('meigi-demo-fixture-officer'))
const ZERO = '0x0000000000000000000000000000000000000000'

const registry = { address: env.registry, abi: payeeRegistryAbi } as const

function toDate(seconds: bigint): Date | null {
  return seconds > 0n ? new Date(Number(seconds) * 1000) : null
}

export async function readPayee(tNumber: ParsedTNumber): Promise<PayeeSnapshot> {
  const args = [tNumber.value] as const
  const [view, officers, resolvesAt, changeDelay] = await Promise.all([
    publicClient.readContract({ ...registry, functionName: 'payeeOf', args }),
    publicClient.readContract({ ...registry, functionName: 'officersOf', args }),
    publicClient.readContract({ ...registry, functionName: 'resolvesAt', args }),
    publicClient.readContract({ ...registry, functionName: 'changeDelay' }),
  ])
  const status = STATUS[view.status] ?? 'unregistered'
  return {
    tNumber,
    status,
    legalName: status === 'active' ? view.legalName : '',
    controller: view.controller === ZERO ? null : view.controller,
    payout: status === 'active' && view.payout !== ZERO ? view.payout : null,
    payoutChangeLandsAt: view.pending === ZERO ? null : toDate(view.effectiveAt),
    rotationLandsAt: view.nextController === ZERO ? null : toDate(view.controllerEffectiveAt),
    disputeResolvesAt: status === 'disputed' ? toDate(resolvesAt) : null,
    threshold: view.threshold,
    officerCount: officers.length,
    placeholderOfficer: officers.length > 0 && officers.every((officer) => officer === PLACEHOLDER_OFFICER),
    nonce: view.nonce,
    evidence: view.evidence,
    changeDelaySeconds: Number(changeDelay),
    readAt: new Date(),
  }
}

/** The address `name` resolves to through ENS (universal resolver → PayeeResolver), or null. */
export async function resolveEnsAddress(name: string): Promise<HexAddress | null> {
  return publicClient.getEnsAddress({ name })
}
