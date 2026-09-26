// The chain log under the panel: what the agent sent to the AgentVault, and what came back. Every value is from
// the recorded runs (the simulated PayeeMismatch, the approved payment on Sepolia).

import { shortAddress } from '../../../lib/chain/format'
import { BEC } from './bec'
import { PAID, URGENT } from './urgent'

export type LogTone = 'cmd' | 'ok' | 'fail' | 'muted'

export interface LogLine {
  readonly id: string
  readonly text: string
  readonly tone: LogTone
}

const { error, broadcast } = BEC.outcome
const expected = error.args.expected ? shortAddress(error.args.expected) : BEC.payToShort
const registered = error.args.registered ? shortAddress(error.args.registered) : BEC.registeredShort

export const VAULT = '0x87A798CD92dE1340B1b761dd45196AC82bEF793B'

export const LOG_LINES: readonly LogLine[] = [
  { id: 'sim', text: `› simulate payInvoice(${BEC.tNumber}, ${BEC.payToShort}, ${BEC.amount})`, tone: 'cmd' },
  { id: 'revert', text: `← revert ${error.name}(expected ${expected}, registered ${registered})`, tone: 'fail' },
  {
    id: 'nothing',
    text: broadcast ? 'the transaction reverted on-chain' : 'nothing broadcast: an eth_call, not a transaction',
    tone: 'muted',
  },
  {
    id: 'pay',
    text: `› payInvoice(${URGENT.tNumber}, ${PAID.payToShort}, ${PAID.amount}) · human approval`,
    tone: 'cmd',
  },
  { id: 'paid', text: `← paid ${PAID.amount} → ${PAID.payToShort} · tx ${PAID.txShort}`, tone: 'ok' },
  { id: 'block', text: `block ${PAID.block.toLocaleString('en-US')} · Sepolia`, tone: 'muted' },
]
