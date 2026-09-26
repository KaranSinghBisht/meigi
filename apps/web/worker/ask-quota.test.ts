// `pnpm --filter @meigi/web test:worker`: the daily caps' Durable Object, in memory.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { askerTag, AskQuota, peekQuota, refundQuota, takeQuota, type QuotaNamespace } from './ask-quota'

function namespace(today?: unknown): QuotaNamespace & { readonly stored: () => unknown } {
  const store = new Map<string, unknown>(today === undefined ? [] : [['today', today]])
  const object = new AskQuota({
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key, value) => void store.set(key, value),
    },
  })
  return {
    idFromName: (name) => name,
    get: () => ({ fetch: (input, init) => object.fetch(new Request(input, init)) }),
    stored: () => store.get('today'),
  }
}

const A = 'aaaaaaaaaaaaaaaa'
const B = 'bbbbbbbbbbbbbbbb'
const DAY = '2026-09-26'
const ROOMY = { neuronCap: 1_000_000, neurons: 50 } // the neuron budget, out of the way
const open = (quota: QuotaNamespace, day: string, cap: number, neuronCap = ROOMY.neuronCap) =>
  peekQuota(quota, { day, cap, neuronCap })

describe('AskQuota', () => {
  it('counts each asker against their own cap and everyone against the day’s', async () => {
    const quota = namespace()
    const take = (asker: string) => takeQuota(quota, { day: DAY, asker, cap: 3, askerCap: 2, ...ROOMY })
    assert.deepEqual(await take(A), { taken: true })
    assert.deepEqual(await take(A), { taken: true })
    assert.deepEqual(await take(A), { taken: false, reason: 'ip_limited' })
    assert.deepEqual(await take(B), { taken: true })
    assert.equal(await open(quota, DAY, 3), false)
    assert.deepEqual(await take(B), { taken: false, reason: 'paused' })
    assert.deepEqual(quota.stored(), { day: DAY, total: 3, byAsker: { [A]: 2, [B]: 1 }, neurons: 150 })
  })

  it('gives a question back, never below zero, but not its neurons; and starts each day empty', async () => {
    const quota = namespace()
    await takeQuota(quota, { day: DAY, asker: A, cap: 1, askerCap: 1, ...ROOMY })
    assert.equal(await open(quota, DAY, 1), false)
    await refundQuota(quota, { day: DAY, asker: A })
    await refundQuota(quota, { day: DAY, asker: A })
    assert.deepEqual(quota.stored(), { day: DAY, total: 0, byAsker: { [A]: 0 }, neurons: 50 })
    assert.equal(await open(quota, DAY, 1), true)
    await takeQuota(quota, { day: DAY, asker: A, cap: 1, askerCap: 1, ...ROOMY })
    assert.equal(await open(quota, '2026-09-27', 1), true)
    const tomorrow = { day: '2026-09-27', asker: A, cap: 1, askerCap: 1, ...ROOMY }
    assert.deepEqual(await takeQuota(quota, tomorrow), { taken: true })
    assert.deepEqual(quota.stored(), { day: '2026-09-27', total: 1, byAsker: { [A]: 1 }, neurons: 50 })
  })

  it('pauses everyone once the next call could pass the day’s neuron budget', async () => {
    const quota = namespace()
    const take = (asker: string) =>
      takeQuota(quota, { day: DAY, asker, cap: 30, askerCap: 5, neuronCap: 120, neurons: 50 })
    assert.deepEqual(await take(A), { taken: true })
    assert.deepEqual(await take(B), { taken: true })
    assert.deepEqual(await take(A), { taken: false, reason: 'paused' }) // 150 would pass 120
    await refundQuota(quota, { day: DAY, asker: B })
    assert.deepEqual(await take(B), { taken: false, reason: 'paused' }) // the refund gave back the question only
    assert.equal(await open(quota, DAY, 30, 100), false)
    assert.equal(await open(quota, DAY, 30, 101), true)
  })

  it('reads a record an older version wrote, field by field', async () => {
    const quota = namespace({ day: DAY, total: 2, byAsker: { [A]: 2, [B]: 'x' } }) // no neurons yet
    assert.equal(await open(quota, DAY, 3), true)
    assert.deepEqual(await takeQuota(quota, { day: DAY, asker: B, cap: 3, askerCap: 5, ...ROOMY }), { taken: true })
    assert.deepEqual(quota.stored(), { day: DAY, total: 3, byAsker: { [A]: 2, [B]: 1 }, neurons: 50 })
  })

  it('never lets a request from a day that has ended overwrite the next day', async () => {
    const quota = namespace()
    const tomorrow = '2026-09-27'
    const at = (day: string, asker: string) => ({ day, asker, cap: 1, askerCap: 1, ...ROOMY })
    assert.deepEqual(await takeQuota(quota, at(tomorrow, A)), { taken: true }) // the new day is full
    const before = quota.stored()
    assert.deepEqual(await takeQuota(quota, at(DAY, B)), { taken: false, reason: 'paused' }) // started at 23:59:59
    await refundQuota(quota, { day: DAY, asker: A })
    assert.equal(await open(quota, DAY, 1), false)
    assert.deepEqual(quota.stored(), before)
    assert.equal(await open(quota, tomorrow, 1), false)
    assert.deepEqual(await takeQuota(quota, at(tomorrow, B)), { taken: false, reason: 'paused' })
  })

  it('starts a day over a record whose day it cannot read', async () => {
    const quota = namespace({ day: 'garbage', total: 99, byAsker: {}, neurons: 99 })
    assert.equal(await open(quota, DAY, 1), true)
    assert.deepEqual(await takeQuota(quota, { day: DAY, asker: A, cap: 1, askerCap: 1, ...ROOMY }), { taken: true })
  })

  it('refuses a malformed day, cap or asker', async () => {
    const quota = namespace()
    const stub = quota.get(quota.idFromName('ask-the-ledger'))
    for (const path of [
      '/peek?day=today&cap=1',
      '/take?day=2026-09-26&cap=-1&askerCap=1&neuronCap=9&neurons=1&asker=aaaaaaaaaaaaaaaa',
      '/take?day=2026-09-26&cap=1&askerCap=1&neuronCap=9&neurons=1&asker=198.51.100.7',
      '/take?day=2026-09-26&cap=1&neuronCap=9&neurons=1&asker=aaaaaaaaaaaaaaaa',
      '/take?day=2026-09-26&cap=1&askerCap=1&neuronCap=9&asker=aaaaaaaaaaaaaaaa',
      '/refund?day=2026-09-26&asker=everyone',
    ]) {
      assert.equal((await stub.fetch(`https://quota${path}`, { method: 'POST' })).status, 400, path)
    }
  })
})

describe('askerTag', () => {
  it('is 16 hex characters, the same all day, and never the address', async () => {
    const tag = await askerTag('198.51.100.7', DAY)
    assert.match(tag, /^[0-9a-f]{16}$/)
    assert.equal(await askerTag('198.51.100.7', DAY), tag)
    assert.notEqual(await askerTag('198.51.100.7', '2026-09-27'), tag)
    assert.notEqual(await askerTag('198.51.100.8', DAY), tag)
  })
})
