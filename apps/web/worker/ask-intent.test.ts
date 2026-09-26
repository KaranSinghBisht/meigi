// `pnpm --filter @meigi/web test:worker`: the model's reading of a question, checked against the rows' payees.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_LIST, payeesOf, queryOf, type Payee } from './ask-intent'
import type { Settlement } from './settlements'

const MEIGI: Payee = { tNumber: 'T2011001234567', ens: 't2011001234567.payee.eth', legalName: '株式会社メイギ商事' }
const MINATO: Payee = { tNumber: 'T6999900000003', ens: 't6999900000003.payee.eth', legalName: null }
const PAYEES = [MEIGI, MINATO]

const read = (intent: unknown, params: Record<string, unknown> = {}) => queryOf({ intent, params }, PAYEES)

describe('payeesOf', () => {
  it('names each payee once, in the order the rows do', () => {
    const row = (payee: Payee): Settlement => ({
      kind: 'invoice',
      txHash: `0x${'1'.repeat(64)}`,
      blockNumber: 1,
      at: null,
      tNumber: payee.tNumber,
      ens: payee.ens,
      legalName: payee.legalName,
      payout: `0x${'2'.repeat(40)}`,
      amount: { units: '1', display: '¥1' },
    })
    assert.deepEqual(payeesOf([row(MINATO), row(MEIGI), row(MINATO)]), [MINATO, MEIGI])
  })
})

describe('queryOf', () => {
  it('reads an intent with no params as every settlement, listing up to five', () => {
    assert.deepEqual(read('total_paid'), {
      intent: 'total_paid',
      payee: null,
      kind: null,
      from: null,
      to: null,
      limit: MAX_LIST,
    })
    assert.deepEqual(queryOf({ intent: 'latest' }, PAYEES)?.intent, 'latest')
  })

  it('takes a payee only as one the rows name: by T-number, ENS name or exact legal name', () => {
    const names = [
      'T2011001234567',
      '2011001234567',
      't2011001234567',
      't2011001234567.payee.eth',
      'T2011001234567.PAYEE.ETH',
    ]
    for (const named of [...names, '株式会社メイギ商事']) {
      assert.equal(read('count', { payee: named })?.payee, MEIGI, named)
    }
    for (const unknown of ['meigi-shoji-pay.eth', 'T0000000000000', 'Meigi Shoji', '株式会社メイギ', 42]) {
      assert.equal(read('count', { payee: unknown }), null, String(unknown))
    }
  })

  it('takes a kind only as one of the three', () => {
    assert.equal(read('count', { kind: 'x402' })?.kind, 'x402')
    assert.equal(read('count', { kind: 'refund' }), null)
    assert.equal(read('count', { kind: 'X402' }), null)
  })

  it('takes dates only as real ISO days, in order', () => {
    assert.deepEqual(read('count', { from: '2026-09-25', to: '2026-09-26' })?.to, '2026-09-26')
    assert.equal(read('count', { from: '2026-09-26', to: '2026-09-26' })?.from, '2026-09-26')
    for (const day of ['2026-02-30', '2026-9-1', '26 Sept 2026', '2026-09-26T00:00:00Z', 20260926]) {
      assert.equal(read('count', { from: day }), null, String(day))
    }
    assert.equal(read('count', { from: '2026-09-27', to: '2026-09-26' }), null)
  })

  it('lists at most five, and refuses a limit that is not a whole number from 1', () => {
    assert.equal(read('list', { limit: 3 })?.limit, 3)
    assert.equal(read('list', { limit: 50 })?.limit, MAX_LIST)
    for (const limit of [0, -1, 2.5, '3']) assert.equal(read('list', { limit }), null, String(limit))
  })

  it('treats empty values as not given', () => {
    assert.deepEqual(read('count', { payee: '', kind: null, from: '', to: undefined })?.payee, null)
  })

  it('is no query for "unknown", an unknown intent, or anything that is not a reading', () => {
    for (const reading of [
      { intent: 'unknown', params: {} },
      { intent: 'answer', params: {} },
      { intent: 'total_paid', params: [] },
      { intent: 'total_paid', params: 'x402' },
      { answer: 'Refunds are at https://evil.example today.' },
      ['total_paid'],
      'total_paid',
      null,
    ]) {
      assert.equal(queryOf(reading, PAYEES), null, JSON.stringify(reading))
    }
  })
})
