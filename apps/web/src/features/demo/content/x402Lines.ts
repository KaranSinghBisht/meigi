import { shortHash } from '../../../lib/chain/format'
import type { GuardCheck, X402Purchase, X402Run } from './x402'

export type LineTone = 'cmd' | 'wire' | 'ok' | 'fail' | 'skip' | 'plain'

export interface TermLine {
  readonly id: string
  readonly text: string
  readonly tone: LineTone
  /** The purchase this line belongs to, so chapter 5 can pace each one. */
  readonly purchase: string
}

const MARK: Record<GuardCheck['state'], string> = { pass: '✓', fail: '✗', skip: '–' }
const TONE: Record<GuardCheck['state'], LineTone> = { pass: 'ok', fail: 'fail', skip: 'skip' }

function outcomeLine(purchase: X402Purchase): Pick<TermLine, 'text' | 'tone'> {
  const { outcome } = purchase
  if (outcome.status === 'refused') return { text: `guard ✗ refused before signing: ${outcome.reason}`, tone: 'fail' }
  const tx = outcome.txHash ? ` · tx ${shortHash(outcome.txHash)}` : ''
  return { text: `signed → settled ${purchase.price}${tx}`, tone: 'ok' }
}

function purchaseLines(buyer: string, purchase: X402Purchase): TermLine[] {
  const declared = purchase.declared
    ? `payee ${purchase.declared.tNumber} · ${purchase.declared.ens} · payTo ${purchase.payTo}`
    : `no payee declared · payTo ${purchase.payTo}`
  const raw: Pick<TermLine, 'text' | 'tone'>[] = [
    { text: `› ${buyer} needs ${purchase.item} from ${purchase.merchant}`, tone: 'cmd' },
    { text: `${purchase.request} → 402 Payment Required · ${purchase.price}`, tone: 'wire' },
    { text: declared, tone: 'plain' },
    ...purchase.checks.map((check) => ({
      text: `guard ${MARK[check.state]} ${check.label}: ${check.detail}`,
      tone: TONE[check.state],
    })),
    outcomeLine(purchase),
  ]
  return raw.map((line, index) => ({ ...line, id: `${purchase.id}-${index}`, purchase: purchase.id }))
}

export function terminalLines(run: X402Run): TermLine[] {
  return run.purchases.flatMap((purchase) => purchaseLines(run.buyer, purchase))
}
