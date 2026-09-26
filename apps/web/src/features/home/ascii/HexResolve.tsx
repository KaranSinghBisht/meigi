import { COLOR, HEX, PAYEE, noise, progress, sweepText } from './glyphs'
import { useAsciiCanvas, type AsciiGrid } from './useAsciiCanvas'

const LOOP = 9
const PIECE = { cols: 50, stillAt: 6 }

/** How far a cell is from the canvas edge, 0..1: the sea thins out towards it, so the piece has no edges. */
function inset(g: AsciiGrid, c: number, r: number): number {
  return Math.min(1, c / 8, (g.cols - 1 - c) / 8, r / 3, (g.rows - 1 - r) / 3)
}

/** The sea of hex: sparse, churning, brighter where a slow wave passes; kept clear around the rows being read. */
function drawSea(g: AsciiGrid, t: number, band: number, clear: number): void {
  for (let r = 0; r < g.rows; r++) {
    const near = Math.min(1, Math.abs(r - band) / 5)
    const keep = 1 - clear * (1 - near * near)
    if (keep <= 0.02) continue
    for (let c = 0; c < g.cols; c++) {
      const edge = inset(g, c, r)
      if (edge <= 0 || noise(c, r, 7) > 0.42) continue
      const tick = Math.floor(t * (2 + noise(c, r, 3) * 7))
      const ch = HEX[Math.floor(noise(c, r, tick) * 16)] ?? '0'
      const wave = Math.max(0, Math.sin(c * 0.18 + r * 0.42 - t * 1.3))
      const color = noise(c, r, 11) > 0.8 ? COLOR.blush : COLOR.mist
      g.put(c, r, ch, color, (0.22 + wave * 0.38) * keep * edge)
    }
  }
}

/** The payout address locking in from the left; the part still unread keeps churning. */
function drawAddress(g: AsciiGrid, t: number, r: number, settle: number, alpha: number): void {
  if (settle <= 0 || alpha <= 0) return
  const s = PAYEE.payout
  const c0 = Math.floor((g.cols - s.length) / 2)
  const edge = settle * (s.length + 4)
  for (let i = 0; i < s.length; i++) {
    const locked = i < edge - 4
    const ch = locked ? (s[i] ?? '') : (HEX[Math.floor(noise(i, r, Math.floor(t * 14)) * 16)] ?? '0')
    g.put(c0 + i, r, ch, locked ? COLOR.ink : COLOR.lavender, (locked ? 1 : 0.6) * alpha)
  }
}

/** What the address turns out to be: the company, and the ENS name any wallet resolves to the same address. */
function drawIdentity(g: AsciiGrid, band: number, shown: number): void {
  if (shown <= 0) return
  const nameWidth = g.width(PAYEE.name, { jp: true, scale: 2.4 })
  g.put(Math.floor(g.cols / 2), band - 1, '↓', COLOR.iris, shown)
  g.text(Math.floor((g.cols - nameWidth) / 2), band + 1, PAYEE.name, COLOR.ink, { jp: true, scale: 2.4, alpha: shown })
  const ens = PAYEE.ens
  sweepText(g.put, Math.floor((g.cols - ens.length) / 2), band + 3.4, ens, COLOR.iris, shown)
}

function drawHexResolve(g: AsciiGrid): void {
  const t = g.time % LOOP
  const band = Math.floor(g.rows / 2)
  const settle = progress(t, 0.9, 2.6)
  const named = progress(t, 3.0, 4.3)
  const shown = 1 - progress(t, 7.5, 8.6)
  drawSea(g, t, band, Math.max(settle, named) * shown)
  drawAddress(g, t, band - 3, settle, shown * (1 - 0.55 * named))
  drawIdentity(g, band, named * shown)
}

/** "An address is just a string": hex churns, then one address resolves into the company it belongs to. */
export function HexResolve() {
  const ref = useAsciiCanvas(drawHexResolve, PIECE)
  return <canvas ref={ref} className="ascii" aria-hidden="true" />
}
