import { COLOR, HEX, PAYEE, noise, progress } from './glyphs'
import { useAsciiCanvas, type AsciiGrid } from './useAsciiCanvas'

const LOOP = 12
const PIECE = { cols: 56, stillAt: 6.2 }
const BAR = 30
const WINDOW = { start: 1.8, end: 8.6 } // the 72 hours, compressed
const LABEL = 9

/** Each loop moves the payout to the other address, so a loop starts where the last one ended. */
function addresses(time: number): { readonly from: string; readonly to: string } {
  const even = Math.floor(time / LOOP) % 2 === 0
  return even ? { from: PAYEE.payout, to: PAYEE.nextPayout } : { from: PAYEE.nextPayout, to: PAYEE.payout }
}

/** The name and the company it stands for: drawn every frame at full strength, and never animated. */
function drawName(g: AsciiGrid, r: number): void {
  const ens = g.width(PAYEE.ens, { scale: 1.45, weight: 600 })
  g.text(Math.floor((g.cols - ens) / 2), r, PAYEE.ens, COLOR.iris, { scale: 1.45, weight: 600 })
  const name = g.width(PAYEE.name, { jp: true, scale: 1.5 })
  g.text(Math.floor((g.cols - name) / 2), r + 1.8, PAYEE.name, COLOR.ink, { jp: true, scale: 1.5 })
  g.put(Math.floor(g.cols / 2), r + 3.4, '│', COLOR.mist, 0.9)
}

/** A row of hex that is `settled` (0..1) of the way from churn to `target`, settling from the left. */
function drawHex(g: AsciiGrid, c0: number, r: number, target: string, settled: number, t: number, color: string): void {
  const edge = settled * (target.length + 3)
  for (let i = 0; i < target.length; i++) {
    const done = i < edge - 3
    const ch = done ? (target[i] ?? '') : (HEX[Math.floor(noise(i, r, Math.floor(t * 12)) * 16)] ?? '0')
    g.put(c0 + i, r, ch, done ? color : COLOR.lavender, done ? 1 : 0.55)
  }
}

/** The change window: the new address arriving as pending, a bar filling over 72 hours, the hours left. */
function drawWindow(g: AsciiGrid, c0: number, r: number, to: string, t: number): void {
  const open = progress(t, WINDOW.start - 0.4, WINDOW.start) * (1 - progress(t, WINDOW.end, WINDOW.end + 0.5))
  if (open <= 0) return
  const p = Math.min(1, Math.max(0, (t - WINDOW.start) / (WINDOW.end - WINDOW.start)))
  g.text(c0, r, 'PENDING', COLOR.soft, { alpha: open })
  drawHex(g, c0 + LABEL, r, to, progress(t, WINDOW.start, WINDOW.start + 2.2), t, COLOR.iris)
  const filled = Math.round(p * BAR)
  for (let k = 0; k < BAR; k++) {
    g.put(c0 + LABEL + k, r + 1.4, k < filled ? '█' : '░', k < filled ? COLOR.lavender : COLOR.mist, open * (k < filled ? 0.9 : 0.6))
  }
  const hours = String(Math.ceil(72 * (1 - p))).padStart(2, '0')
  g.text(c0 + LABEL, r + 2.8, `${hours} h left · in public`, COLOR.soft, { alpha: open })
}

function drawNameOutlivesKeys(g: AsciiGrid): void {
  const t = g.time % LOOP
  const { from, to } = addresses(g.time)
  const c0 = Math.max(0, Math.floor((g.cols - (LABEL + from.length)) / 2))
  const top = Math.max(0, Math.floor(g.rows / 2) - 6)
  drawName(g, top)
  const swapped = progress(t, WINDOW.end, WINDOW.end + 0.6)
  const payout = swapped > 0 ? to : from
  g.text(c0, top + 5, 'PAYOUT', COLOR.soft)
  drawHex(g, c0 + LABEL, top + 5, payout, swapped > 0 ? swapped : 1, t, COLOR.ink)
  drawWindow(g, c0, top + 7, to, t)
  const note = 'payout changed · the name never moved'
  const shown = progress(t, WINDOW.end + 0.6, WINDOW.end + 1.1) * (1 - progress(t, LOOP - 0.8, LOOP - 0.2))
  g.text(Math.floor((g.cols - note.length) / 2), top + 11.2, note, COLOR.jade, { alpha: shown })
}

/** "A name that outlives its keys": the ENS name holds still while the address under it changes over 72 hours. */
export function NameOutlivesKeys() {
  const ref = useAsciiCanvas(drawNameOutlivesKeys, PIECE)
  return <canvas ref={ref} className="ascii" aria-hidden="true" />
}
