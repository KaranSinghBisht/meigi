// `pnpm --filter @meigi/web test:worker`: what a question must be before anything is counted, and who is asking.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clientKey, isJson, MAX_BODY, questionIn, readCapped, sameOrigin } from './ask-request'

const request = (headers: Record<string, string>, body?: BodyInit) =>
  new Request('https://meigi.test/api/ask', { method: 'POST', headers, ...(body === undefined ? {} : { body }) })
const from = (ip: string) =>
  clientKey(new Request('https://meigi.test/api/ask', { headers: { 'cf-connecting-ip': ip } }))

describe('sameOrigin', () => {
  it('trusts Sec-Fetch-Site when a browser sends it, else an Origin that is ours', () => {
    assert.equal(sameOrigin(request({ 'sec-fetch-site': 'same-origin' })), true)
    for (const site of ['same-site', 'cross-site', 'none']) {
      assert.equal(sameOrigin(request({ 'sec-fetch-site': site })), false)
    }
    assert.equal(sameOrigin(request({ 'sec-fetch-site': 'cross-site', origin: 'https://meigi.test' })), false)
    assert.equal(sameOrigin(request({ origin: 'https://meigi.test' })), true)
    assert.equal(sameOrigin(request({ origin: 'https://meigi.test.evil.example' })), false)
    assert.equal(sameOrigin(request({ origin: 'null' })), false)
    assert.equal(sameOrigin(request({})), false)
  })
})

describe('isJson', () => {
  it('takes application/json with or without parameters, and nothing a form can send', () => {
    assert.equal(isJson(request({ 'content-type': 'application/json' })), true)
    assert.equal(isJson(request({ 'content-type': 'Application/JSON; charset=utf-8' })), true)
    for (const type of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'application/jsonx',
    ]) {
      assert.equal(isJson(request({ 'content-type': type })), false, type)
    }
  })
})

describe('readCapped', () => {
  it('reads a small body, and refuses a large one by content-length or as it streams', async () => {
    assert.equal(await readCapped(request({}, '{"question":"hi"}')), '{"question":"hi"}')
    assert.equal(await readCapped(request({ 'content-length': String(MAX_BODY + 1) }, 'x')), null)
    assert.equal(await readCapped(request({ 'content-length': 'lots' }, 'x')), null)
    assert.equal(await readCapped(request({}, 'x'.repeat(MAX_BODY + 1))), null)
    assert.equal(await readCapped(request({}, 'é'.repeat(MAX_BODY / 2 + 1))), null) // bytes, not characters
    assert.equal(await readCapped(new Request('https://meigi.test/api/ask', { method: 'POST' })), '')
  })
})

describe('questionIn', () => {
  it('takes 1 to 300 characters of text from { question }, trimmed', () => {
    assert.equal(questionIn('{"question":"  Who has been paid the most?  "}'), 'Who has been paid the most?')
    assert.equal(questionIn(JSON.stringify({ question: '名'.repeat(300) })), '名'.repeat(300))
    for (const body of [
      '{"question":""}',
      '{"question":42}',
      '[]',
      'null',
      '{',
      JSON.stringify({ question: 'x'.repeat(301) }),
    ]) {
      assert.equal(questionIn(body), null, body)
    }
  })
})

describe('clientKey', () => {
  it('keys an IPv4 address as itself, and an IPv6 address as its /64', () => {
    assert.equal(from('198.51.100.7'), '198.51.100.7')
    assert.equal(from('2001:db8:1:2::a'), '2001:db8:1:2::/64')
    assert.equal(from('2001:0DB8:0001:0002:ffff:1:2:3'), '2001:db8:1:2::/64')
    assert.equal(from('2001:db8::1'), '2001:db8:0:0::/64')
    assert.equal(from('::1'), '0:0:0:0::/64')
    assert.equal(from('64:ff9b::192.0.2.33'), '64:ff9b:0:0::/64')
    assert.equal(from('::ffff:198.51.100.7'), '198.51.100.7')
  })

  it('is "unknown" without an address, or for one that is not IPv6', () => {
    assert.equal(clientKey(new Request('https://meigi.test/api/ask')), 'unknown')
    for (const ip of ['2001:db8::1::2', '2001:db8:1:2:3:4:5:6:7', 'zz01:db8::1', '2001:db8:1']) {
      assert.equal(from(ip), 'unknown', ip)
    }
  })
})
