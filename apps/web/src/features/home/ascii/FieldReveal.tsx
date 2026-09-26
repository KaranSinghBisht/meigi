import { COLOR, PAYEE, progress, sweepText } from './glyphs'
import { useAsciiCanvas, type AsciiGrid } from './useAsciiCanvas'

const LOOP = 13
const PIECE = { cols: 58, stillAt: 7.3 }
const BAR = 10
const LABEL = 12
const PASS = 1.3 // seconds per re-check once the record is complete

const FIELDS: readonly (readonly [string, string])[] = [
  ['T-NUMBER', PAYEE.tNumber],
  ['LEGAL NAME', PAYEE.name],
  ['PAYOUT', `${PAYEE.payout.slice(0, 6)}…${PAYEE.payout.slice(-4)}`],
  ['OFFICERS', 'World ID · each officer'],
  ['TIMELOCK', '72 h, in public'],
  ['ENS', PAYEE.ens],
]

interface Layout {
  readonly c0: number
  readonly top: number
  readonly bar: boolean
  readonly value: number
  readonly check: number
}

function layoutOf(g: AsciiGrid): Layout {
  const bar = g.cols >= 54
  const width = LABEL + (bar ? BAR + 3 : 0) + 26 + 2
  const c0 = Math.max(0, Math.floor((g.cols - width) / 2))
  const value = c0 + LABEL + (bar ? BAR + 3 : 0)
  return { c0, top: Math.max(0, Math.floor(g.rows / 2) - 7), bar, value, check: value + 26 }
}

/** One field: its label, a bar that fills as it is checked, then the value and a check mark. */
function drawField(g: AsciiGrid, L: Layout, i: number, t: number, lit: number, alpha: number): void {
  const [label, value] = FIELDS[i] ?? ['', '']
  const start = 0.4 + i * 0.55
  const r = L.top + i * 2
  const labelColor = lit > 0 ? COLOR.iris : COLOR.soft
  g.text(L.c0, r, label, labelColor, { alpha })
  if (L.bar) {
    const filled = Math.round(progress(t, start, start + 0.45) * BAR)
    for (let k = 0; k < BAR; k++) {
      g.put(L.c0 + LABEL + 1 + k, r, k < filled ? '█' : '░', k < filled ? COLOR.lavender : COLOR.mist, alpha * (k < filled ? 0.9 : 0.5))
    }
  }
  const shown = progress(t, start + 0.35, start + 0.8)
  if (label === 'LEGAL NAME') g.text(L.value, r, value, COLOR.ink, { jp: true, alpha: shown * alpha })
  else sweepText(g.put, L.value, r, value, lit > 0 ? COLOR.iris : COLOR.ink, shown * alpha)
  const check = progress(t, start + 0.7, start + 0.85)
  g.put(L.check, r, '✓', COLOR.jade, check * alpha * (1 + lit))
}

/** After the record is complete, every payment re-checks it: a scan runs down the fields and a counter ticks. */
function drawChecks(g: AsciiGrid, L: Layout, t: number, alpha: number): number {
  const since = t - 5
  if (since < 0) return -1
  const pass = Math.floor(since / PASS)
  const row = Math.floor(((since % PASS) / PASS) * (FIELDS.length + 2))
  const line = `PAYMENT #${String(1041 + pass).padStart(4, '0')}  checked against the record  ✓`
  sweepText(g.put, L.c0, L.top + FIELDS.length * 2 + 1, line, COLOR.jade, progress(t, 5, 5.5) * alpha)
  return row < FIELDS.length ? row : -1
}

function drawFieldReveal(g: AsciiGrid): void {
  const t = g.time % LOOP
  const L = layoutOf(g)
  const alpha = 1 - progress(t, 12.1, 12.8)
  const lit = drawChecks(g, L, t, alpha)
  for (let i = 0; i < FIELDS.length; i++) drawField(g, L, i, t, i === lit ? 1 : 0, alpha)
}

/** "Registered once. Checked on every payment.": the record fills in field by field, then every payment re-reads it. */
export function FieldReveal() {
  const ref = useAsciiCanvas(drawFieldReveal, PIECE)
  return <canvas ref={ref} className="ascii" aria-hidden="true" />
}
