// `pnpm --filter @meigi/web test:worker`: the settlements API against a scripted MultiBaas (node:test, no network).

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import worker from './index'
import { createMemo } from './memo'
import { createReader, Upstream, type MultiBaasReader, type Payee, type QueryName } from './multibaas'
import { createSettlements, settlementsResponse, type Snapshot, type SnapshotStore } from './settlements'

const MEIGI = '0x9b4fc8994fcf2d5fe08a82a9454b61aa14d647e4'
const MINATO = '0x4d6d5528f4a4c9e404130fab23f5fa5ddcaffd30'
const BUYER = '0x708106dcdee19be75ffcd5df20cbb1b6b3089882'
const MJPYC = '0xeca2b093682a46b14b143474d188a120ba2d0ec2'
const FAKE_TOKEN = '0x2222222222222222222222222222222222222222'
const tx = (n: number) => `0x${n.toString(16).padStart(64, '0')}`
const units = (yen: number) => (BigInt(yen) * 10n ** 18n).toString()

/** A MultiBaas with one vault payment (and its Transfer), a router payment in mJPYC, and the buyer's transfers. */
function scripted(overrides: Partial<MultiBaasReader> = {}): MultiBaasReader & { calls: string[] } {
  const calls: string[] = []
  const rows: Record<QueryName, Record<string, unknown>[]> = {
    meigi_invoices_paid: [{ tnumber: '2011001234567', payout: MEIGI, amount: units(55_000), invoiceref: '[1, 2]', block: '11784200', at: '2026-09-26 06:00:00+00', txhash: tx(1) }],
    meigi_router_paid: [
      { tnumber: '6999900000003', payout: MINATO, token: MJPYC, amount: units(500), invoiceref: '[3]', block: 11784100, at: null, txhash: tx(2) },
    ],
    meigi_mjpy_transfers: [
      { sender: BUYER, recipient: MEIGI, amount: units(55_000), block: '11784200', at: null, txhash: tx(1) }, // inside the vault payment
      { sender: BUYER, recipient: MINATO, amount: units(15), block: '11784165', at: '2026-09-26 05:31:48+00', txhash: tx(3) },
      { sender: BUYER, recipient: '0x1111111111111111111111111111111111111111', amount: units(1), block: '11784301', at: null, txhash: tx(6) }, // not a payee
    ],
  }
  const payees: Record<string, Payee> = {
    '2011001234567': { legalName: '株式会社メイギ商事', payout: '0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4' },
    '6999900000003': { legalName: '株式会社ミナトGPUクラウド', payout: '0x4d6D5528f4a4c9E404130Fab23F5FA5DDcaffD30' },
    '8999900000001': { legalName: null, payout: null }, // disputed: withheld
  }
  const count = <T>(name: string, value: T) => (calls.push(name), Promise.resolve(value))
  return {
    calls,
    rows: (query) => count(query, rows[query]),
    payee: (digits) => count(`payee:${digits}`, payees[digits] ?? { legalName: null, payout: null }),
    decimals: () => count('decimals', 18),
    indexedFrom: () => count('indexedFrom', 11783796),
    tokenAddress: () => count('token', MJPYC),
    ...overrides,
  }
}

const OPTIONS = { payees: ['T2011001234567', 'T6999900000003', 'T8999900000001'], token: '0xEcA2B093682a46B14b143474d188A120bA2d0EC2', x402Buyer: BUYER }
const get = async (api: ReturnType<typeof createSettlements>, query = '') => {
  const response = await settlementsResponse(new URL(`https://meigi.example/api/settlements${query}`), api)
  return { status: response.status, cache: response.headers.get('cache-control'), body: (await response.json()) as Record<string, any> }
}
/** Runs with console.error captured into `lines` instead of printed. */
const quietly = async <T>(run: () => Promise<T>, lines: string[] = []): Promise<T> => {
  const log = console.error
  console.error = (...args: unknown[]) => void lines.push(args.join(' '))
  try {
    return await run()
  } finally {
    console.error = log
  }
}

describe('GET /api/settlements', () => {
  it('lists vault, mJPYC router and x402 payments to registered payees, newest first, each once', async () => {
    const { status, cache, body } = await get(createSettlements(scripted(), OPTIONS))
    assert.equal(status, 200)
    assert.equal(cache, 'public, max-age=60')
    assert.equal(body.indexer, 'Curvegrid MultiBaas')
    assert.equal(body.indexedFrom, 11783796)
    assert.deepEqual(
      body.settlements.map((s: Record<string, unknown>) => [s.kind, s.txHash, s.tNumber, s.amount]),
      [
        ['invoice', tx(1), 'T2011001234567', { units: units(55_000), display: '¥55,000' }], // its Transfer isn't listed again
        ['x402', tx(3), 'T6999900000003', { units: units(15), display: '¥15' }], // block 11784165
        ['router', tx(2), 'T6999900000003', { units: units(500), display: '¥500' }], // block 11784100
      ], // not listed: the transfer to a non-payee (tx 6)
    )
    assert.deepEqual(body.settlements[0], {
      kind: 'invoice',
      txHash: tx(1),
      blockNumber: 11784200,
      at: '2026-09-26T06:00:00.000Z',
      tNumber: 'T2011001234567',
      ens: 't2011001234567.payee.eth',
      legalName: '株式会社メイギ商事',
      payout: MEIGI,
      amount: { units: units(55_000), display: '¥55,000' },
    })
  })

  it('answers 503 on a missing or malformed SETTLEMENT_TOKEN or X402_BUYER, logs which, and asks MultiBaas nothing', async () => {
    const cases = [
      [{ x402Buyer: null }, 'Misconfigured: X402_BUYER is missing or not an address'],
      [{ x402Buyer: '0x7081' }, 'Misconfigured: X402_BUYER is missing or not an address'],
      [{ token: null }, 'Misconfigured: SETTLEMENT_TOKEN is missing or not an address'],
      [{ token: 'mJPYC' }, 'Misconfigured: SETTLEMENT_TOKEN is missing or not an address'],
    ] as const
    for (const [settings, log] of cases) {
      const reader = scripted()
      const lines: string[] = []
      const { status, cache, body } = await quietly(() => get(createSettlements(reader, { ...OPTIONS, ...settings })), lines)
      assert.equal(status, 503)
      assert.equal(cache, 'no-store')
      assert.deepEqual(body, { code: 'settlements_unavailable', message: 'Settlements are unavailable right now.' })
      assert.deepEqual(lines, [`[settlements] ${log}`])
      assert.deepEqual(reader.calls, [])
    }
  })

  it('answers 503 when the meigi_mjpy alias points at another token, without running the queries, re-reading it hourly', async () => {
    let aliasReads = 0
    const reader = scripted({ tokenAddress: async () => (aliasReads++, FAKE_TOKEN) })
    let clock = 1_790_000_000_000
    const api = createSettlements(reader, { ...OPTIONS, memo: createMemo(() => clock), now: () => clock })
    for (let i = 0; i < 5; i++) {
      const lines: string[] = []
      assert.equal((await quietly(() => get(api), lines)).status, 503)
      assert.deepEqual(lines, ['[settlements] Misconfigured: the meigi_mjpy alias in MultiBaas is not SETTLEMENT_TOKEN'])
      clock += 20_000 // past the 15 s a failed snapshot is kept
    }
    assert.equal(aliasReads, 1)
    assert.deepEqual(reader.calls, []) // no queries, no payeeOf
  })

  it('narrows to one payee, and validates the T-number', async () => {
    const api = createSettlements(scripted(), OPTIONS)
    const one = await get(api, '?tNumber=T6999900000003')
    assert.equal(one.body.tNumber, 'T6999900000003')
    assert.deepEqual(one.body.settlements.map((s: Record<string, unknown>) => s.kind), ['x402', 'router'])
    const bad = await get(api, '?tNumber=12345')
    assert.equal(bad.status, 400)
    assert.equal(bad.body.code, 'invalid_t_number')
  })

  it('answers any T-number outside the scope with nothing, at no cost to MultiBaas', async () => {
    const reader = scripted()
    const api = createSettlements(reader, OPTIONS)
    await get(api)
    const before = reader.calls.length
    for (let i = 0; i < 100; i++) {
      const { status, body } = await get(api, `?tNumber=T${9_000_000_000_000 + i}`)
      assert.equal(status, 200)
      assert.deepEqual(body.settlements, [])
    }
    assert.equal(reader.calls.length, before)
  })

  it('reads MultiBaas once per snapshot window, and shares the snapshot between isolates', async () => {
    const reader = scripted()
    let clock = 0
    let shared: Snapshot | null = null
    const store: SnapshotStore = { get: async () => shared, put: async (s) => void (shared = s) }
    const first = createSettlements(reader, { ...OPTIONS, store, memo: createMemo(() => clock), now: () => clock })
    await get(first)
    await get(first, '?tNumber=T2011001234567')
    assert.equal(reader.calls.filter((c) => c.startsWith('meigi_')).length, 3)
    const second = createSettlements(reader, { ...OPTIONS, store, memo: createMemo(() => clock), now: () => clock }) // another isolate
    assert.equal((await get(second)).body.settlements.length, 3)
    assert.equal(reader.calls.filter((c) => c.startsWith('meigi_')).length, 3)
    assert.equal(reader.calls.filter((c) => c.startsWith('payee:')).length, 3) // the scope, once
  })

  it('costs MultiBaas 3 calls a refresh: payeeOf is re-read every 10 min, the alias, decimals and start hourly', async () => {
    const reader = scripted()
    let clock = 1_790_000_000_000
    let shared: Snapshot | null = null
    const store: SnapshotStore = { get: async () => shared, put: async (s) => void (shared = s) }
    const api = createSettlements(reader, { ...OPTIONS, store, memo: createMemo(() => clock), now: () => clock })
    const costs: number[] = []
    for (let refresh = 0; refresh < 10; refresh++) {
      const before = reader.calls.length
      for (const query of ['', '?tNumber=T2011001234567', '?tNumber=T6999900000003']) assert.equal((await get(api, query)).status, 200)
      costs.push(reader.calls.length - before)
      clock += 181_000 // past the 3-minute snapshot window, in the isolate and at the edge
    }
    // The first also reads the alias, decimals, the indexing start and the 3 payees in scope; the 5th (12 min) and
    // 9th (24 min) re-read the payees. 30 min of refreshes: 30 queries, 9 payeeOf and 3 hourly reads.
    assert.deepEqual(costs, [3 + 3 + 3, 3, 3, 3, 3 + 3, 3, 3, 3, 3 + 3, 3])
    assert.equal(reader.calls.filter((c) => c === 'token' || c === 'decimals' || c === 'indexedFrom').length, 3)
  })

  it('ignores a shared snapshot that fails the row checks, and reads MultiBaas instead', async () => {
    const reader = scripted()
    const clock = 1_790_000_000_000
    const good = createSettlements(scripted(), { ...OPTIONS, now: () => clock })
    const { body } = await get(good)
    const snapshot = { asOf: body.asOf, indexedFrom: body.indexedFrom, decimals: 18, scope: ['T2011001234567'], settlements: body.settlements }
    const poisoned = [
      { ...body.settlements[0], payout: 'javascript:alert(1)' },
      { ...body.settlements[0], kind: 'refund' },
      { ...body.settlements[0], txHash: '0x12' },
      { ...body.settlements[0], ens: 'evil.eth' },
      { ...body.settlements[0], amount: { units: '-1', display: '¥1' } },
      { ...body.settlements[0], at: 'yesterday' },
    ]
    for (const row of poisoned) {
      const store: SnapshotStore = { get: async () => ({ ...snapshot, settlements: [row] }), put: async () => {} }
      const api = createSettlements(reader, { ...OPTIONS, store, memo: createMemo(() => clock), now: () => clock })
      assert.equal((await get(api)).body.settlements.length, 3) // MultiBaas's three, not the cached row
    }
    assert.equal(reader.calls.filter((c) => c === 'meigi_invoices_paid').length, poisoned.length)
    const clean: SnapshotStore = { get: async () => snapshot, put: async () => {} }
    const served = createSettlements(reader, { ...OPTIONS, store: clean, memo: createMemo(() => clock), now: () => clock })
    assert.deepEqual((await get(served)).body.settlements, body.settlements) // the positive control: a good copy is used
    assert.equal(reader.calls.filter((c) => c === 'meigi_invoices_paid').length, poisoned.length)
  })

  it('keeps an edge copy in an isolate only for what is left of its 3 minutes', async () => {
    const reader = scripted()
    let clock = 1_790_000_000_000
    let shared: Snapshot | null = null
    const store: SnapshotStore = { get: async () => shared, put: async (s) => void (shared = s) }
    const isolate = () => createSettlements(reader, { ...OPTIONS, store, memo: createMemo(() => clock), now: () => clock })
    const first = await get(isolate())
    const reads = () => reader.calls.filter((c) => c === 'meigi_invoices_paid').length
    clock += 170_000
    const late = isolate() // starts 10 s before the copy expires
    assert.equal((await get(late)).body.asOf, first.body.asOf)
    assert.equal(reads(), 1)
    clock += 11_000 // 181 s after the read
    assert.notEqual((await get(late)).body.asOf, first.body.asOf)
    assert.equal(reads(), 2)
  })

  it('answers 503 when a saved query returns a row its own filter should have excluded, and logs which', async () => {
    const [invoice] = await scripted().rows('meigi_invoices_paid')
    const otherToken = { ...invoice, token: FAKE_TOKEN, invoiceref: '[4]', txhash: tx(5) }
    const mint = { sender: '0x0000000000000000000000000000000000000000', recipient: MINATO, amount: units(1_000_000), block: '11784300', at: null, txhash: tx(4) }
    const cases: [Partial<Record<QueryName, Record<string, unknown>[]>>, string][] = [
      [{ meigi_router_paid: [otherToken] }, 'meigi_router_paid returned a payment in a token other than SETTLEMENT_TOKEN'],
      [{ meigi_mjpy_transfers: [mint] }, 'meigi_mjpy_transfers returned a transfer from a sender other than X402_BUYER'],
    ]
    for (const [rows, log] of cases) {
      const base = scripted()
      const reader = scripted({ rows: async (query) => rows[query] ?? base.rows(query) })
      const lines: string[] = []
      const { status } = await quietly(() => get(createSettlements(reader, OPTIONS)), lines)
      assert.equal(status, 503)
      assert.deepEqual(lines, [`[settlements] Misconfigured: ${log}`])
    }
  })

  it('never uses an edge copy dated in the future, and displays a copy\'s amounts from their units', async () => {
    const clock = 1_790_000_000_000
    const { body } = await get(createSettlements(scripted(), { ...OPTIONS, now: () => clock }))
    const copy = { asOf: body.asOf, indexedFrom: body.indexedFrom, decimals: 18, scope: ['T2011001234567'], settlements: body.settlements }
    const reader = scripted()
    const future: SnapshotStore = { get: async () => ({ ...copy, asOf: new Date(clock + 60_000).toISOString() }), put: async () => {} }
    await get(createSettlements(reader, { ...OPTIONS, store: future, memo: createMemo(() => clock), now: () => clock }))
    assert.equal(reader.calls.filter((c) => c === 'meigi_invoices_paid').length, 1) // read MultiBaas instead
    const misprinted = { ...copy, settlements: copy.settlements.map((s: Record<string, any>) => ({ ...s, amount: { ...s.amount, display: '¥999,999,999' } })) }
    const store: SnapshotStore = { get: async () => misprinted, put: async () => {} }
    const served = await get(createSettlements(scripted(), { ...OPTIONS, store, memo: createMemo(() => clock), now: () => clock }))
    assert.deepEqual(served.body.settlements.map((s: Record<string, any>) => s.amount.display), ['¥55,000', '¥15', '¥500'])
  })

  it('never reuses an edge snapshot older than 3 minutes, even if the cache still returns it', async () => {
    const reader = scripted()
    let clock = 1_790_000_000_000
    let shared: Snapshot | null = null
    const store: SnapshotStore = { get: async () => shared, put: async (s) => void (shared = s) }
    const api = createSettlements(reader, { ...OPTIONS, store, memo: createMemo(() => clock), now: () => clock })
    await get(api)
    clock += 181_000 // past the edge window and the isolate memo
    await get(api)
    assert.equal(reader.calls.filter((c) => c === 'meigi_invoices_paid').length, 2)
  })

  it('answers a generic 503 when MultiBaas fails, never its message', async () => {
    const failing = scripted({ rows: () => Promise.reject(new Upstream('MultiBaas answered 401')) })
    const { status, cache, body } = await quietly(() => get(createSettlements(failing, OPTIONS)))
    assert.equal(status, 503)
    assert.equal(cache, 'no-store')
    assert.deepEqual(body, { code: 'settlements_unavailable', message: 'Settlements are unavailable right now.' })
  })

  it('fails the answer on a malformed row instead of showing half a payment', async () => {
    const odd = scripted({ rows: async () => [{ tnumber: '2011001234567', payout: 'not an address', amount: '1', block: '1', txhash: tx(1) }] })
    assert.equal((await quietly(() => get(createSettlements(odd, OPTIONS)))).status, 503)
  })
})

describe('the MultiBaas reader', () => {
  it('sends the key only to an https *.multibaas.com deployment, with no redirects', async () => {
    const seen: { url: string; init: RequestInit }[] = []
    const fetcher = (async (url: string, init: RequestInit) => {
      seen.push({ url, init })
      return new Response(JSON.stringify({ status: 200, result: { kind: 'MethodCallResponse', output: 18 } }), { status: 200 })
    }) as unknown as typeof fetch
    const reader = createReader({ ASSETS: { fetch }, MULTIBAAS_URL: 'https://abc123.multibaas.com', MULTIBAAS_API_KEY: 'k'.repeat(32) }, fetcher)
    assert.equal(await reader.decimals(), 18)
    assert.equal(seen[0]?.url, 'https://abc123.multibaas.com/api/v0/chains/ethereum/addresses/meigi_mjpy/contracts/meigi_jpy_token/methods/decimals')
    assert.equal(seen[0]?.init.redirect, 'manual')
    assert.equal((seen[0]?.init.headers as Record<string, string>).authorization, `Bearer ${'k'.repeat(32)}`)

    for (const url of ['http://abc123.multibaas.com', 'https://evil.example', 'https://abc.multibaas.com.evil.example', 'https://abc.multibaas.com/x']) {
      const refused = createReader({ ASSETS: { fetch }, MULTIBAAS_URL: url, MULTIBAAS_API_KEY: 'k'.repeat(32) }, fetcher)
      await assert.rejects(refused.decimals(), Upstream)
    }
    assert.equal(seen.length, 1) // nothing was sent to the refused URLs
  })

  it('turns an error answer into Upstream without its body', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ status: 400, message: 'secret upstream detail' }), { status: 400 })) as unknown as typeof fetch
    const reader = createReader({ ASSETS: { fetch }, MULTIBAAS_URL: 'https://abc123.multibaas.com', MULTIBAAS_API_KEY: 'k'.repeat(32) }, fetcher)
    await assert.rejects(reader.rows('meigi_invoices_paid'), (error: unknown) => error instanceof Upstream && !error.message.includes('secret'))
  })
})

describe('the Worker', () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') } }

  it('serves assets for every path outside /api/', async () => {
    assert.equal(await (await worker.fetch(new Request('https://meigi.example/registry/T2011001234567'), env)).text(), 'asset')
  })

  it('answers only GET /api/settlements, with nosniff and an Allow header on 405', async () => {
    const missing = await worker.fetch(new Request('https://meigi.example/api/other'), env)
    assert.equal(missing.status, 404)
    assert.equal(missing.headers.get('x-content-type-options'), 'nosniff')
    const post = await worker.fetch(new Request('https://meigi.example/api/settlements', { method: 'POST' }), env)
    assert.equal(post.status, 405)
    assert.equal(post.headers.get('allow'), 'GET, HEAD')
  })
})
