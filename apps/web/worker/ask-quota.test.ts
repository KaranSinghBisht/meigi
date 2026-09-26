// `pnpm --filter @meigi/web test:worker`: the daily caps' Durable Object, in memory.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { askerTag, AskQuota, peekQuota, refundQuota, takeQuota, type QuotaNamespace } from './ask-quota'

function namespace(): QuotaNamespace & { readonly stored: () => unknown } {
  const store = new Map<string, unknown>()
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

describe('AskQuota', () => {
  it('counts each asker against their own cap and everyone against the day’s', async () => {
    const quota = namespace()
    const take = (asker: string) => takeQuota(quota, { day: DAY, asker, cap: 3, askerCap: 2 })
    assert.deepEqual(await take(A), { taken: true })
    assert.deepEqual(await take(A), { taken: true })
    assert.deepEqual(await take(A), { taken: false, reason: 'ip_limited' })
    assert.deepEqual(await take(B), { taken: true })
    assert.equal(await peekQuota(quota, DAY, 3), false)
    assert.deepEqual(await take(B), { taken: false, reason: 'paused' })
    assert.deepEqual(quota.stored(), { day: DAY, total: 3, byAsker: { [A]: 2, [B]: 1 } })
  })

  it('gives a question back, never below zero, and starts each day empty', async () => {
    const quota = namespace()
    await takeQuota(quota, { day: DAY, asker: A, cap: 1, askerCap: 1 })
    assert.equal(await peekQuota(quota, DAY, 1), false)
    await refundQuota(quota, { day: DAY, asker: A })
    await refundQuota(quota, { day: DAY, asker: A })
    assert.deepEqual(quota.stored(), { day: DAY, total: 0, byAsker: { [A]: 0 } })
    assert.equal(await peekQuota(quota, DAY, 1), true)
    await takeQuota(quota, { day: DAY, asker: A, cap: 1, askerCap: 1 })
    assert.equal(await peekQuota(quota, '2026-09-27', 1), true)
    assert.deepEqual(await takeQuota(quota, { day: '2026-09-27', asker: A, cap: 1, askerCap: 1 }), { taken: true })
    assert.deepEqual(quota.stored(), { day: '2026-09-27', total: 1, byAsker: { [A]: 1 } })
  })

  it('refuses a malformed day, cap or asker', async () => {
    const quota = namespace()
    const stub = quota.get(quota.idFromName('ask-the-ledger'))
    for (const path of [
      '/peek?day=today&cap=1',
      '/take?day=2026-09-26&cap=-1&askerCap=1&asker=aaaaaaaaaaaaaaaa',
      '/take?day=2026-09-26&cap=1&askerCap=1&asker=198.51.100.7',
      '/take?day=2026-09-26&cap=1&asker=aaaaaaaaaaaaaaaa',
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
