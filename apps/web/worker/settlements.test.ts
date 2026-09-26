// `pnpm --filter @meigi/web test:worker`: the settlements API against a scripted MultiBaas (node:test, no network).

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import worker from './index'
import { createMemo } from './memo'
import { createReader, Upstream, type MultiBaasReader, type Payee, type QueryName } from './multibaas'
import { createSettlements, settlementsResponse } from './settlements'

const MEIGI = '0x9b4fc8994fcf2d5fe08a82a9454b61aa14d647e4'
const MINATO = '0x4d6d5528f4a4c9e404130fab23f5fa5ddcaffd30'
const BUYER = '0x708106dcdee19be75ffcd5df20cbb1b6b3089882'
const tx = (n: number) => `0x${n.toString(16).padStart(64, '0')}`
const units = (yen: number) => (BigInt(yen) * 10n ** 18n).toString()

/** A MultiBaas with one vault payment (and its Transfer), one router payment and two x402 sales. */
function scripted(overrides: Partial<MultiBaasReader> = {}): MultiBaasReader & { calls: string[] } {
  const calls: string[] = []
  const rows: Record<QueryName, Record<string, unknown>[]> = {
    meigi_invoices_paid: [{ tnumber: '2011001234567', payout: MEIGI, amount: units(55_000), invoiceref: tx(9), block: '11784200', at: '2026-09-26 06:00:00+00', txhash: tx(1) }],
    meigi_router_paid: [{ tnumber: '6999900000003', payout: MINATO, amount: units(500), invoiceref: tx(8), block: 11784100, at: null, txhash: tx(2) }],
    meigi_mjpy_transfers: [
      { sender: '0x87a798cd92de1340b1b761dd45196ac82bef793b', recipient: MEIGI, amount: units(55_000), block: '11784200', at: '2026-09-26 06:00:00+00', txhash: tx(1) },
      { sender: BUYER, recipient: MINATO, amount: units(15), block: '11784165', at: '2026-09-26 05:31:48+00', txhash: tx(3) },
      { sender: BUYER, recipient: '0x1111111111111111111111111111111111111111', amount: units(1), block: '11784300', at: null, txhash: tx(4) },
    ],
  }
  const payees: Record<string, Payee> = {
    '2011001234567': { legalName: '株式会社メイギ商事', payout: '0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4' },
    '6999900000003': { legalName: '株式会社ミナトGPUクラウド', payout: '0x4d6D5528f4a4c9E404130Fab23F5FA5DDcaffD30' },
    '8999900000001': { legalName: null, payout: null }, // disputed: withheld
  }
  return {
    calls,
    async rows(query) {
      calls.push(query)
      return rows[query]
    },
    async payee(digits) {
      calls.push(`payee:${digits}`)
      return payees[digits] ?? { legalName: null, payout: null }
    },
    async decimals() {
      calls.push('decimals')
      return 18
    },
    async indexedFrom() {
      calls.push('indexedFrom')
      return 11783796
    },
    ...overrides,
  }
}

const PAYEES = ['T2011001234567', 'T6999900000003', 'T8999900000001']
const get = async (api: ReturnType<typeof createSettlements>, query = '') => {
  const response = await settlementsResponse(new URL(`https://meigi.example/api/settlements${query}`), api)
  return { status: response.status, cache: response.headers.get('cache-control'), body: (await response.json()) as Record<string, any> }
}

describe('GET /api/settlements', () => {
  it('lists vault, router and direct payments to registered payees, newest first, each once', async () => {
    const { status, cache, body } = await get(createSettlements(scripted(), PAYEES))
    assert.equal(status, 200)
    assert.equal(cache, 'public, max-age=30')
    assert.equal(body.indexer, 'Curvegrid MultiBaas')
    assert.equal(body.indexedFrom, 11783796)
    assert.deepEqual(
      body.settlements.map((s: Record<string, unknown>) => [s.kind, s.txHash, s.tNumber, s.amount]),
      [
        ['invoice', tx(1), 'T2011001234567', { units: units(55_000), display: '¥55,000' }], // its Transfer isn't listed again
        ['transfer', tx(3), 'T6999900000003', { units: units(15), display: '¥15' }], // block 11784165
        ['router', tx(2), 'T6999900000003', { units: units(500), display: '¥500' }], // block 11784100
      ], // the transfer to an unregistered address (tx 4) is not a settlement
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

  it('narrows to one payee, and validates the T-number', async () => {
    const api = createSettlements(scripted(), PAYEES)
    const one = await get(api, '?tNumber=T6999900000003')
    assert.equal(one.body.tNumber, 'T6999900000003')
    assert.deepEqual(one.body.settlements.map((s: Record<string, unknown>) => s.kind), ['transfer', 'router'])
    const bad = await get(api, '?tNumber=12345')
    assert.equal(bad.status, 400)
    assert.equal(bad.body.code, 'invalid_t_number')
  })

  it('reads MultiBaas once per cache window, whatever the requests', async () => {
    const reader = scripted()
    let clock = 0
    const api = createSettlements(reader, PAYEES, createMemo(() => clock))
    await get(api)
    await get(api, '?tNumber=T2011001234567')
    assert.equal(reader.calls.filter((c) => c.startsWith('meigi_')).length, 3)
    clock += 46_000
    await get(api)
    assert.equal(reader.calls.filter((c) => c.startsWith('meigi_')).length, 6)
    assert.equal(reader.calls.filter((c) => c === 'payee:2011001234567').length, 1) // registry records last 10 min
  })

  it('answers a generic 503 when MultiBaas fails, never its message', async () => {
    const failing = scripted({
      rows: async () => {
        throw new Upstream('MultiBaas answered 401')
      },
    })
    const errors: unknown[] = []
    const log = console.error
    console.error = (...args: unknown[]) => void errors.push(args)
    try {
      const { status, cache, body } = await get(createSettlements(failing, PAYEES))
      assert.equal(status, 503)
      assert.equal(cache, 'no-store')
      assert.deepEqual(body, { code: 'settlements_unavailable', message: 'Settlements are unavailable right now.' })
    } finally {
      console.error = log
    }
    assert.equal(errors.length, 1)
  })

  it('fails the answer on a malformed row instead of showing half a payment', async () => {
    const odd = scripted({ rows: async () => [{ tnumber: '2011001234567', payout: 'not an address', amount: '1', block: '1', txhash: tx(1) }] })
    const log = console.error
    console.error = () => {}
    try {
      assert.equal((await get(createSettlements(odd, PAYEES))).status, 503)
    } finally {
      console.error = log
    }
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

  it('answers only GET /api/settlements', async () => {
    assert.equal((await worker.fetch(new Request('https://meigi.example/api/other'), env)).status, 404)
    assert.equal((await worker.fetch(new Request('https://meigi.example/api/settlements', { method: 'POST' }), env)).status, 405)
  })
})
