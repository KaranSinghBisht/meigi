import { shortHash } from '../../../lib/chain/format'
import type { GuardCheck, X402Purchase, X402Run } from './x402'

export type LineTone = 'cmd' | 'wire' | 'ok' | 'fail' | 'skip' | 'plain'

export interface TermLine {
  readonly id: string
  readonly text: string
  readonly tone: LineTone
  /** The purchase this line belongs to, so chapter 5 can pace each one. */
  readonly purchase: string
  /** Index of the guard check this line reports, if it reports one. */
  readonly check: number | null
}

const MARK: Record<GuardCheck['state'], string> = { pass: '✓', fail: '✗', skip: '–' }
const TONE: Record<GuardCheck['state'], LineTone> = { pass: 'ok', fail: 'fail', skip: 'skip' }

type Draft = Pick<TermLine, 'text' | 'tone'> & { readonly check?: number }

function outcomeLine(purchase: X402Purchase): Draft {
  const { outcome } = purchase
  if (outcome.status === 'refused') return { text: `guard ✗ refused before signing: ${outcome.reason}`, tone: 'fail' }
  const tx = outcome.txHash ? ` · tx ${shortHash(outcome.txHash)}` : ''
  return { text: `signed → settled${purchase.price ? ` ${purchase.price}` : ''}${tx}`, tone: 'ok' }
}

function purchaseLines(buyer: string, purchase: X402Purchase): TermLine[] {
  const declared = purchase.declared
    ? `declares ${purchase.declared.tNumber}${purchase.declared.ens ? ` · ${purchase.declared.ens}` : ''} · payTo ${purchase.payTo}`
    : `declares no payee · payTo ${purchase.payTo}`
  const drafts: Draft[] = [
    { text: `› ${buyer}: ${purchase.title}`, tone: 'cmd' },
    { text: `${purchase.request} → 402 Payment Required${purchase.price ? ` · ${purchase.price}` : ''}`, tone: 'wire' },
    { text: declared, tone: 'plain' },
    ...purchase.checks.map((check, index) => ({
      text: `guard ${MARK[check.state]} ${check.label}: ${check.detail}`,
      tone: TONE[check.state],
      check: index,
    })),
    outcomeLine(purchase),
  ]
  return drafts.map((line, index) => ({
    text: line.text,
    tone: line.tone,
    check: line.check ?? null,
    id: `${purchase.id}-${index}`,
    purchase: purchase.id,
  }))
}

export function terminalLines(run: X402Run): TermLine[] {
  return run.purchases.flatMap((purchase) => purchaseLines(run.buyer, purchase))
}
