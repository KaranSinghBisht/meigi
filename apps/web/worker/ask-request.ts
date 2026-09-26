// "Ask the ledger": what a question must be before anything is counted, and who is asking. A question comes from our
// own page (Sec-Fetch-Site, or Origin when a browser sends no Sec-Fetch-Site), as JSON, in at most MAX_BODY bytes
// (refused by content-length before reading, and counted as it streams), with 1 to MAX_QUESTION characters. The
// per-IP limits key on an IPv4 address or an IPv6 /64, since one household or server holds a whole /64.

import { MAX_QUESTION } from './ask-prompt'

export const MAX_BODY = 2048

/** The browser's own word that the page asking is ours. A request with neither header is not treated as ours. */
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site !== null) return site === 'same-origin'
  return request.headers.get('origin') === new URL(request.url).origin
}

/** application/json, with or without parameters (a form post can't send it without a CORS preflight). */
export function isJson(request: Request): boolean {
  const type = request.headers.get('content-type') ?? ''
  return type.split(';')[0]?.trim().toLowerCase() === 'application/json'
}

function joined(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** The body as text, or null when it is over `max` bytes: by content-length before reading, else as it streams. */
export async function readCapped(request: Request, max = MAX_BODY): Promise<string | null> {
  const declared = request.headers.get('content-length')
  if (declared !== null && !(/^\d+$/.test(declared) && Number(declared) <= max)) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(joined(chunks, size))
}

/** The question from a JSON body `{ question }`: 1 to MAX_QUESTION characters once trimmed, or null. */
export function questionIn(text: string): string | null {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  const question = typeof body === 'object' && body !== null ? (body as { question?: unknown }).question : null
  if (typeof question !== 'string') return null
  const trimmed = question.trim()
  return trimmed.length > 0 && [...trimmed].length <= MAX_QUESTION ? trimmed : null
}

const HEX_GROUP = /^[0-9a-f]{1,4}$/i

/** The first four groups of an IPv6 address, written in full ("2001:db8:0:1"), or null if it isn't one. */
function ipv6Head(ip: string): string | null {
  const halves = ip.split('::')
  if (halves.length > 2) return null
  const groups = (part: string | undefined) => (part ? part.split(':') : [])
  const head = groups(halves[0])
  const tail = groups(halves[1])
  // An embedded IPv4 address (…:192.0.2.1) fills the last two groups.
  const width = (list: readonly string[]) => list.reduce((n, group) => n + (group.includes('.') ? 2 : 1), 0)
  const missing = 8 - width(head) - width(tail)
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const all = [...head, ...Array<string>(halves.length === 1 ? 0 : missing).fill('0'), ...tail]
  const first = all.slice(0, 4)
  if (first.length < 4 || !first.every((group) => HEX_GROUP.test(group))) return null
  return first.map((group) => parseInt(group, 16).toString(16)).join(':')
}

/** Who is asking, as Cloudflare saw them: an IPv4 address, or an IPv6 /64. "unknown" when there is no address. */
export function clientKey(request: Request): string {
  const ip = (request.headers.get('cf-connecting-ip') ?? '').trim()
  if (!ip) return 'unknown'
  if (!ip.includes(':')) return ip
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)?.[1]
  if (mapped) return mapped
  const head = ipv6Head(ip)
  return head ? `${head}::/64` : 'unknown'
}
