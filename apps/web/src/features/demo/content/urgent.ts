// Chapter 4: a genuine but urgent invoice, the agent's real reading of it, and the real payment a human approved
// through World ID for Agents on World's sandbox. All of it is one run, on 2026-09-26 (docs/world-agents-approve-run.md,
// audit log entries #77 to #85):
// - the invoice is demo document 07 as it read that night, invoice MS-2026-0931; its SHA-256 is the audit's
//   documentSha256 (8df32f2b…);
// - the analysis is that run's own, read back from the agent's store (id 874eb11f…, 13:14:27Z, audit #77), recorded
//   before the payment: it holds on triage and pressure alone. Its `approval` field is as the agent answers now,
//   after the payment; at the time it was approvable (audit #77);
// - the enrolled approver approved at 22:16:51 JST with sandbox code RMHB9-MFQB4 (audit #81), and the agent key paid
//   through the ENS MandateGate in tx 0xf7507446…, block 11,786,455 (audit #85, and the tx's own logs).

import { parseAnalysis } from '../../../lib/api/agentParse'
import { shortAddress, shortHash } from '../../../lib/chain/format'
import analysisJson from './urgent-analysis.json'
import { segment } from './segments'
import invoiceText from './urgent-invoice.ja.txt?raw'

const analysis = parseAnalysis(analysisJson)
const { extracted, triage } = analysis

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`the recorded urgent-invoice run has no ${what}`)
  return value
}

if (triage.status !== 'ok') throw new Error('the recorded urgent-invoice run must carry a triage answer')

const invoice = required(extracted.invoiceNumber, 'invoice number')
const payTo = required(extracted.address, 'pay-to address')
const urgentFlag = extracted.flags.find((flag) => flag.code === 'urgent_language')

export const URGENT = {
  recordedAt: new Date(analysisJson.createdAt),
  analysis,
  triage,
  mail: {
    fromName: '株式会社メイギ商事 経理部',
    fromAddress: 'keiri@meigi-shoji.example',
    subject: '【至急】ご請求書送付のお知らせ',
    attachment: `請求書_${invoice}.pdf`,
  },
  document: segment(invoiceText, [
    { key: 'urgent', find: urgentFlag?.evidence ?? null },
    { key: 'tNumber', find: extracted.tNumber },
    { key: 'amount', find: extracted.amount?.display ?? null, suffix: '（税込）' },
    { key: 'address', find: payTo },
    { key: 'invoice', find: invoice },
  ]),
  urgentEvidence: urgentFlag?.evidence ?? null,
  tNumber: required(extracted.tNumber, 'T-number'),
  amount: required(extracted.amount?.display, 'amount'),
  invoice,
  payTo,
  payToShort: shortAddress(payTo),
  /** The holds the approval releases: World ID for Agents may only release triage and pressure holds. */
  holds: analysis.verdict.reasons.filter((reason) => reason.severity === 'block' && reason.layer === 'triage'),
} as const

/** World ID for Agents on World's sandbox IdP: the device flow, and the approval as the audit log records it. */
export const APPROVAL = {
  link: 'sandbox.auth.world.org/device',
  qrUri: 'https://sandbox.auth.world.org/device',
  /** The user code World's page showed the approver (docs/world-agents-approve-run.md). */
  code: 'RMHB9-MFQB4',
  acr: 'orb-v3',
  /** approvedAt 1790428611 (audit #81): 22:16:51 JST. */
  approvedAt: new Date(1_790_428_611 * 1000),
} as const

const TX = '0xf7507446d11c2c5cab94ff4b7ca83db36180b3aa8d80085f9556aaeabcea5a03'
const PAYOUT = '0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4'
const GATE = '0x591dd2b2716b46740C665749A60209B7b22e83BF'

/** The approved payment on Sepolia: 55,000 mJPYC from the AgentVault to the registered payout, via the MandateGate. */
export const PAID = {
  txHash: TX,
  txShort: shortHash(TX),
  block: 11_786_455,
  /** The block's time: 2026-09-26 22:17:12 JST. */
  at: new Date('2026-09-26T13:17:12Z'),
  amount: '¥55,000',
  payTo: PAYOUT,
  payToShort: shortAddress(PAYOUT),
  /** The agent key's call went to the MandateGate, which pays through the vault while the mandate answers. */
  gate: GATE,
  gateShort: shortAddress(GATE),
  mandate: 'ap.t4999900000005.payee.eth',
} as const
