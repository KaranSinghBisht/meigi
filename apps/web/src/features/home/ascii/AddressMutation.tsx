import { COLOR, PAYEE, clamp01, progress } from './glyphs'
import { useAsciiCanvas, type AsciiGrid } from './useAsciiCanvas'

const LOOP = 11
const PIECE = { cols: 56, stillAt: 7.6 }
const SCALE = 1.2
const REAL = PAYEE.payout
const FAKE = PAYEE.lookalike

/** Which characters differ (case-insensitively, as a checksum-blind eye reads them) between the two addresses. */
const DIFFERS = Array.from(REAL, (ch, i) => ch.toLowerCase() !== (FAKE[i] ?? '').toLowerCase())
const CHANGES = DIFFERS.map((d, i) => (d ? i : -1)).filter((i) => i >= 0)

interface Layout {
  readonly c0: number
  readonly top: number
  /** Cells one address character takes at SCALE. */
  readonly step: number
}

function layoutOf(g: AsciiGrid): Layout {
  const step = g.width('0', { scale: SCALE })
  const c0 = Math.max(1, Math.floor((g.cols - REAL.length * step) / 2))
  return { c0, top: Math.max(1, Math.floor(g.rows / 2) - 6), step }
}

/** The invoice's address at time t: the real one, turning into the look-alike one character at a time. */
function invoiceAddress(t: number): { readonly s: string; readonly fresh: number } {
  const turned = Math.floor(clamp01((t - 1.4) / 2.6) * CHANGES.length)
  const chars = Array.from(REAL)
  for (let k = 0; k < turned; k++) {
    const i = CHANGES[k] ?? 0
    chars[i] = FAKE[i] ?? ''
  }
  return { s: chars.join(''), fresh: turned > 0 && turned < CHANGES.length ? (CHANGES[turned - 1] ?? -1) : -1 }
}

function drawRow(g: AsciiGrid, L: Layout, r: number, s: string, color: (i: number) => string, alpha: number): void {
  for (let i = 0; i < s.length; i++) {
    g.text(L.c0 + i * L.step, r, s[i] ?? '', color(i), { scale: SCALE, alpha })
  }
}

/** The vault's comparison: a cursor walks both rows; every character it has passed is marked matched or not. */
function drawCompare(g: AsciiGrid, L: Layout, t: number, alpha: number): void {
  const scan = progress(t, 5.0, 6.6) * (REAL.length + 1)
  if (scan <= 0) return
  for (let i = 0; i < Math.min(REAL.length, scan); i++) {
    const bad = DIFFERS[i] ?? false
    g.text(L.c0 + i * L.step, L.top + 6, bad ? '×' : '·', bad ? COLOR.seal : COLOR.jade, { scale: SCALE, alpha })
  }
  if (scan < REAL.length) g.text(L.c0 + Math.floor(scan) * L.step, L.top + 5, '▼', COLOR.iris, { alpha })
}

/** 拒否 pressed onto the record like a seal: it comes down large and lands, then its frame is drawn. */
function drawStamp(g: AsciiGrid, L: Layout, t: number, alpha: number): void {
  const down = progress(t, 6.7, 6.95)
  if (down <= 0) return
  const scale = 4.6 - down * 1.4
  const w = Math.ceil(g.width('拒否', { jp: true, scale, weight: 900 }))
  const c = Math.floor((g.cols - w) / 2)
  const r = L.top + 10
  g.text(c, r, '拒否', COLOR.seal, { jp: true, scale, weight: 900, alpha: alpha * down })
  if (down < 1) return
  const frame = alpha * progress(t, 6.95, 7.3)
  for (let x = c - 2; x <= c + w + 1; x++) {
    g.put(x, r - 3, '━', COLOR.seal, frame)
    g.put(x, r + 3, '━', COLOR.seal, frame)
  }
  for (let y = r - 2; y <= r + 2; y++) {
    g.put(c - 3, y, '┃', COLOR.seal, frame)
    g.put(c + w + 2, y, '┃', COLOR.seal, frame)
  }
  const note = 'PayeeMismatch · the vault refused'
  g.text(Math.floor((g.cols - note.length) / 2), r + 5, note, COLOR.soft, { alpha: frame })
}

function drawAddressMutation(g: AsciiGrid): void {
  const t = g.time % LOOP
  const L = layoutOf(g)
  const alpha = 1 - progress(t, 10.0, 10.8)
  const { s, fresh } = invoiceAddress(t)
  const marked = progress(t, 5.0, 6.6) > 0
  g.text(L.c0, L.top, 'REGISTERED PAYOUT', COLOR.soft, { alpha })
  drawRow(g, L, L.top + 1, REAL, () => COLOR.ink, alpha)
  g.text(L.c0, L.top + 3, 'THE INVOICE SAYS', COLOR.soft, { alpha })
  drawRow(g, L, L.top + 4, s, (i) => (i === fresh ? COLOR.blush : marked && DIFFERS[i] ? COLOR.seal : COLOR.ink), alpha)
  drawCompare(g, L, t, alpha)
  drawStamp(g, L, t, alpha)
}

/** "One changed character, one lost payment": the invoice's address turns into a look-alike; the vault says 拒否. */
export function AddressMutation() {
  const ref = useAsciiCanvas(drawAddressMutation, PIECE)
  return <canvas ref={ref} className="ascii" aria-hidden="true" />
}
