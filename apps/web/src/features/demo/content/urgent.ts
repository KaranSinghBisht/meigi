// Chapter 4: a genuine but urgent invoice, the agent's real reading of it, and the real payment a human
// approved through World ID for Agents.
//
// The invoice is services/agent/scripts/demo-invoices/07-urgent-invoice.ja.txt under the number the paid
// transaction used: its InvoicePaid invoiceRef is keccak256("T2011001234567|MS-2026-0940"). The analysis is the
// local agent's answer for that exact text (Sepolia, 2026-09-26). It was recorded after the payment, so its kernel
// now also says "already paid": the chapter shows the reading and the triage, and of the verdict only the holds a
// human may release through World ID for Agents (triage and pressure), which is what the approval released before the payment.

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

/** World ID for Agents: the sandbox IdP's device flow, and what the backend checked on the token. */
export const APPROVAL = {
  link: 'sandbox.auth.world.org/device',
  qrUri: 'https://sandbox.auth.world.org/device',
  acr: 'orb-v3',
  amr: 'pop',
} as const

const TX = '0xf15571d7c0adcab8e7ac845379c87c466f85c1c98a90ba41e1987a23dba10c48'
const PAYOUT = '0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4'

/** The approved payment on Sepolia: 55,000 mJPYC from the AgentVault to the registered payout. */
export const PAID = {
  txHash: TX,
  txShort: shortHash(TX),
  block: 11_782_065,
  /** The block's time: 2026-09-26 07:08:00 JST. */
  at: new Date('2026-09-25T22:08:00Z'),
  amount: '¥55,000',
  payTo: PAYOUT,
  payToShort: shortAddress(PAYOUT),
} as const
