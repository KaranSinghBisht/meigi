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

const JST_SECONDS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** A recorded moment to the second, as the audit log and the block have it, e.g. "22:16:51 JST". */
export const jstSeconds = (date: Date): string => `${JST_SECONDS.format(date)} JST`

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

/**
 * World ID for Agents on World's sandbox IdP: the device flow, and the approval exactly as the audit log records it
 * (#81 approval.settled, #83 signer.pay). The log holds no ID token, so nothing is shown about the token itself.
 */
export const APPROVAL = {
  link: 'sandbox.auth.world.org/device',
  qrUri: 'https://sandbox.auth.world.org/device',
  /** The user code World's page showed the approver: not in the audit log, recorded in the run's write-up. */
  code: 'RMHB9-MFQB4',
  /** #81: status "approved", approvedAt 1790428611 (22:16:51 JST), approver "matched". */
  approvedAt: new Date(1_790_428_611 * 1000),
  /** #81 and #83 name the same approver: the first 16 hex of SHA-256(sub). */
  approverId: '92c520d9a85b4ec1',
} as const

/**
 * The first request, refused: #78 approval.started, then #79 approval.settled with status "wrong_human". A second
 * sandbox identity proved, not the approver on file, and the agent sent nothing (no signer event before #80's new
 * request).
 */
export const REFUSED = {
  /** The user code World's page showed for this request: not in the audit log, recorded in the run's write-up. */
  code: 'GC8TN-9SZCR',
  approvalId: '07c5141f-3862-477b-9429-ce2d4817d2d6',
  status: 'wrong_human',
  /** #79's time: 22:15:00 JST. */
  settledAt: new Date('2026-09-26T13:15:00.645Z'),
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
