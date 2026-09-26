// `pnpm --filter @meigi/web test:worker`: answers computed from the rows and written from templates.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answerFor, REFUSAL, refusal, SUGGESTED } from './ask-answer'
import { MAX_LIST, type Query } from './ask-intent'
import { parseYen, totalOf } from './ask-scope'
import type { Kind, Settlement } from './settlements'

const tx = (n: number) => `0x${n.toString(16).padStart(64, '0')}`
const MEIGI = { tNumber: 'T2011001234567', ens: 't2011001234567.payee.eth', legalName: '株式会社メイギ商事' }
const FUJI = { tNumber: 'T8999900000001', ens: 't8999900000001.payee.eth', legalName: '株式会社フジデータ' }
const MINATO = { tNumber: 'T6999900000003', ens: 't6999900000003.payee.eth', legalName: null }
const row = (n: number, kind: Kind, payee: typeof MEIGI | typeof MINATO, display: string, at: string | null) => ({
  kind,
  txHash: tx(n),
  blockNumber: 11_784_000 + n,
  at,
  ...payee,
  payout: `0x${String(n).repeat(40)}`,
  amount: { units: '0', display },
})
// Newest first, as the API serves them. 2026-09-25T16:30Z is already 26 Sept in Japan.
const ROWS: Settlement[] = [
  row(5, 'x402', FUJI, '¥10', '2026-09-26T06:58:00.000Z'),
  row(4, 'invoice', MEIGI, '¥27,500', '2026-09-26T06:47:00.000Z'),
  row(3, 'invoice', MEIGI, '¥33,000', '2026-09-26T05:58:00.000Z'),
  row(2, 'x402', FUJI, '¥15.5', '2026-09-25T16:30:00.000Z'),
  row(1, 'router', MINATO, '¥20', null),
]
const ask = (intent: Query['intent'], params: Partial<Query> = {}) =>
  answerFor({ intent, payee: null, kind: null, from: null, to: null, limit: MAX_LIST, ...params }, ROWS)
const MEIGI_LABEL = '株式会社メイギ商事 (t2011001234567.payee.eth)'
const FUJI_LABEL = '株式会社フジデータ (t8999900000001.payee.eth)'

describe('amounts', () => {
  it('adds exactly, to the last of 18 decimals', () => {
    assert.equal(parseYen('¥15.5'), 15_500_000_000_000_000_000n)
    const tiny = [row(1, 'x402', FUJI, '¥0.000000000000000001', null), row(2, 'x402', FUJI, '¥1,000,000', null)]
    assert.equal(totalOf(tiny), '¥1,000,000.000000000000000001')
    assert.throws(() => parseYen('55000 yen'))
  })
})

describe('answerFor', () => {
  it('totals every settlement, a kind, or one payee, citing at most five rows', () => {
    assert.deepEqual(ask('total_paid'), {
      answer: '¥60,545.5 in total, across 5 settlements.',
      citedTx: [tx(5), tx(4), tx(3), tx(2), tx(1)],
      suggestions: [],
    })
    assert.equal(
      ask('total_paid', { kind: 'x402' }).answer,
      '¥25.5 in total, across 2 x402 purchases by the research agent.',
    )
    assert.equal(
      ask('total_paid', { payee: MEIGI }).answer,
      `¥60,500 in total, across 2 settlements to ${MEIGI_LABEL}.`,
    )
    assert.deepEqual(ask('total_paid', { payee: MEIGI }).citedTx, [tx(4), tx(3)])
  })

  it('counts by Japan day, leaving out rows without a time', () => {
    assert.equal(
      ask('count', { kind: 'x402', payee: FUJI, from: '2026-09-26', to: '2026-09-26' }).answer,
      `There are 2 x402 purchases by the research agent from ${FUJI_LABEL} on 26 Sept 2026 (JST).`,
    )
    assert.equal(ask('count', { kind: 'router' }).answer, 'There is 1 payment through the PayRouter.')
    assert.deepEqual(ask('count', { to: '2026-09-25' }), {
      answer: 'There are no settlements until 25 Sept 2026 (JST).',
      citedTx: [],
      suggestions: [],
    })
  })

  it('names the most recent and the largest payment, with its payee and time', () => {
    assert.deepEqual(ask('latest'), {
      answer: `The most recent settlement was ¥10 to ${FUJI_LABEL}, on 26 Sept 2026, 15:58 JST.`,
      citedTx: [tx(5)],
      suggestions: [],
    })
    assert.equal(
      ask('latest', { kind: 'router' }).answer,
      'The most recent payment through the PayRouter was ¥20 to t6999900000003.payee.eth (name withheld while disputed), at block 11784001.',
    )
    assert.equal(
      ask('largest').answer,
      `The largest settlement was ¥33,000 to ${MEIGI_LABEL}, on 26 Sept 2026, 14:58 JST.`,
    )
    assert.equal(
      ask('largest', { payee: MEIGI }).answer,
      `The largest settlement to ${MEIGI_LABEL} was ¥33,000, on 26 Sept 2026, 14:58 JST.`,
    )
  })

  it('ranks payees by what they were paid, over every payee', () => {
    assert.deepEqual(ask('most_paid'), {
      answer: `${MEIGI_LABEL} has been paid the most: ¥60,500 across 2 settlements.`,
      citedTx: [tx(4), tx(3)],
      suggestions: [],
    })
    assert.equal(
      ask('most_paid', { kind: 'x402', payee: MEIGI }).answer,
      `${FUJI_LABEL} has been paid the most: ¥25.5 across 2 x402 purchases by the research agent.`,
    )
  })

  it('lists the latest rows, one a line', () => {
    assert.deepEqual(ask('list', { limit: 2 }), {
      answer: [
        'The 2 most recent settlements:',
        `¥10 to ${FUJI_LABEL}, on 26 Sept 2026, 15:58 JST`,
        `¥27,500 to ${MEIGI_LABEL}, on 26 Sept 2026, 15:47 JST`,
      ].join('\n'),
      citedTx: [tx(5), tx(4)],
      suggestions: [],
    })
    assert.equal(
      ask('list', { limit: 1, payee: MEIGI }).answer,
      `The most recent settlement to ${MEIGI_LABEL}:\n¥27,500 to ${MEIGI_LABEL}, on 26 Sept 2026, 15:47 JST`,
    )
  })

  it('refuses with the three questions it can answer', () => {
    assert.deepEqual(refusal(), { answer: REFUSAL, citedTx: [], suggestions: SUGGESTED })
    assert.equal(REFUSAL, 'I can only answer questions about these settlements.')
  })
})
