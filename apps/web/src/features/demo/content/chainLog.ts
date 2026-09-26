// The chain log under the panel: what reached the chain in each chapter, and what came back. Each chapter has its
// own group, so a chapter's log tells only its own story. Every value is from the recorded runs (the simulated
// PayeeMismatch, the approved payment, the x402 settlements).

import { shortAddress, shortHash } from '../../../lib/chain/format'
import { BEC } from './bec'
import { PAID, URGENT } from './urgent'
import { X402_RUN } from './x402'

export type LogTone = 'cmd' | 'ok' | 'fail' | 'muted'

export interface LogLine {
  readonly id: string
  readonly text: string
  readonly tone: LogTone
}

export interface LogGroup {
  readonly id: 'refuse' | 'human' | 'agents'
  /** Who is on the other end: the AgentVault, or the x402 facilitator. */
  readonly where: string
  readonly lines: readonly LogLine[]
}

export const VAULT = '0x87A798CD92dE1340B1b761dd45196AC82bEF793B'

const { error, broadcast } = BEC.outcome
const expected = error.args.expected ? shortAddress(error.args.expected) : BEC.payToShort
const registered = error.args.registered ? shortAddress(error.args.registered) : BEC.registeredShort

const refuse: LogGroup = {
  id: 'refuse',
  where: `AgentVault ${shortAddress(VAULT)} · Sepolia`,
  lines: [
    { id: 'sim', text: `› simulate payInvoice(${BEC.tNumber}, ${BEC.payToShort}, ${BEC.amount})`, tone: 'cmd' },
    { id: 'revert', text: `← revert ${error.name}(expected ${expected}, registered ${registered})`, tone: 'fail' },
    {
      id: 'nothing',
      text: broadcast ? 'the transaction reverted on-chain' : 'nothing broadcast: an eth_call, not a transaction',
      tone: 'muted',
    },
  ],
}

const human: LogGroup = {
  id: 'human',
  where: `AgentVault ${shortAddress(VAULT)} · Sepolia`,
  lines: [
    { id: 'pay', text: `› payInvoice(${URGENT.tNumber}, ${PAID.payToShort}, ${PAID.amount}) · approved`, tone: 'cmd' },
    { id: 'paid', text: `← paid ${PAID.amount} → ${PAID.payToShort} · tx ${PAID.txShort}`, tone: 'ok' },
    { id: 'block', text: `block ${PAID.block.toLocaleString('en-US')} · Sepolia`, tone: 'muted' },
  ],
}

const refusedCount = X402_RUN.purchases.filter((purchase) => purchase.outcome.status === 'refused').length

const agents: LogGroup = {
  id: 'agents',
  where: 'x402 facilitator · Sepolia',
  lines: [
    ...X402_RUN.purchases.flatMap((purchase): LogLine[] => {
      const { outcome } = purchase
      if (outcome.status !== 'settled' || !outcome.txHash) return []
      const text = `← settled ${purchase.price ?? ''} → ${purchase.payTo} · tx ${shortHash(outcome.txHash)}`
      return [{ id: `settle-${purchase.id}`, text, tone: 'ok' }]
    }),
    { id: 'refused', text: `${refusedCount} refused before signing: nothing was sent`, tone: 'muted' },
  ],
}

export const LOG_GROUPS: readonly LogGroup[] = [refuse, human, agents]
