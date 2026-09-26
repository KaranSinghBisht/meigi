// Chapters 1–3: the recorded bank-change run (features/agent/recorded), read through the console's own parsers.
// Nothing here is typed in by hand except the reply draft, which the storyboard scripts.

import { shortAddress } from '../../../lib/chain/format'
import { RECORDED_BEC } from '../../agent/recorded'
import { segment, splitMail } from './segments'

const run = RECORDED_BEC
const { extracted, kernel, verdict } = run.analysis
const mail = splitMail(run.document)

function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`the recorded bank-change run has no ${what}`)
  return value
}

const tNumber = required(extracted.tNumber, 'T-number')
const payTo = required(extracted.address, 'pay-to address')
const registered = required(kernel.payee?.registeredPayout, 'registered payout')

/** The "please don't call to confirm" line, underlined as the classic BEC tell. */
export const DONT_CALL = 'お電話でのご確認はお控えいただき'

export const BEC = {
  recordedAt: run.recordedAt,
  analysis: run.analysis,
  outcome: run.outcome,
  mail: mail.headers,
  body: segment(mail.body, [
    { key: 'tNumber', find: tNumber },
    { key: 'amount', find: extracted.amount?.display ?? null, suffix: '（税込）' },
    { key: 'address', find: payTo },
    { key: 'invoice', find: extracted.invoiceNumber },
    { key: 'dontCall', find: DONT_CALL },
  ]),
  tNumber,
  ens: `${tNumber.toLowerCase()}.payee.eth`,
  legalName: kernel.payee?.legalName ?? extracted.claimedName ?? '',
  amount: required(extracted.amount?.display, 'amount'),
  invoice: required(extracted.invoiceNumber, 'invoice number'),
  payTo,
  payToShort: shortAddress(payTo),
  registered,
  registeredShort: shortAddress(registered),
  blocking: verdict.reasons.filter((reason) => reason.severity === 'block'),
} as const

/** The agent's reply, sent to the contact already on file rather than to the sender. Scripted copy. */
export const REPLY_DRAFT = {
  to: '株式会社メイギ商事 経理部 <keiri@meigi-shoji.example>',
  subject: `Re: ${mail.headers.subject}`,
  ja: '新しい受取アドレスは弊社で確認できませんでした。登録済みの受取先へお支払いいたします。',
  en: "We couldn't verify the new payout address. We'll pay your registered account.",
} as const
