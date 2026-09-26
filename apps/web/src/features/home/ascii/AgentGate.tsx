import { COLOR, HEX, clamp01, noise, progress } from './glyphs'
import { useAsciiCanvas, type AsciiGrid } from './useAsciiCanvas'

const LOOP = 8.4
const PIECE = { cols: 60, stillAt: 6.4 }
const TORII = '#e0452b'
const HALF = 7 // cells from the gate's centre to each pillar

interface Scene {
  readonly cx: number
  readonly top: number
  /** The two lanes' rows: the first carries an honest payTo, the second a swapped one. */
  readonly lanes: readonly [number, number]
  readonly left: number
  readonly right: number
}

const YOURS = 'your agent'
const THEIRS = 'their agent'

function sceneOf(g: AsciiGrid): Scene {
  const cx = Math.floor(g.cols / 2)
  const top = Math.max(0, Math.floor(g.rows / 2) - 6)
  return { cx, top, lanes: [top + 5, top + 8], left: YOURS.length + 2, right: g.cols - THEIRS.length - 3 }
}

/** The torii: kasagi, shimaki, the 名義 plaque, the nuki tie beam and two pillars wide enough for both lanes. */
function drawTorii(g: AsciiGrid, s: Scene, glow: string | null, flash: number): void {
  const color = glow && flash > 0 ? glow : TORII
  const a = 0.85
  for (let x = s.cx - HALF - 3; x <= s.cx + HALF + 3; x++) g.put(x, s.top, '▄', color, a)
  for (let x = s.cx - HALF - 1; x <= s.cx + HALF + 1; x++) g.put(x, s.top + 1, '▀', color, a)
  g.text(s.cx - 1.6, s.top + 2, '名義', COLOR.ink, { jp: true, weight: 900, alpha: 0.9 })
  for (let x = s.cx - HALF - 2; x <= s.cx + HALF + 2; x++) g.put(x, s.top + 3, '═', color, a)
  for (let y = s.top + 1; y <= s.lanes[1] + 2; y++) {
    g.put(s.cx - HALF, y, '█', color, a)
    g.put(s.cx + HALF, y, '█', color, a)
  }
}

/** Both lanes as streams of drifting glyphs, with the agents at their ends. */
function drawLanes(g: AsciiGrid, s: Scene, t: number, blocked: number): void {
  const mid = Math.round((s.lanes[0] + s.lanes[1]) / 2)
  g.text(0, mid, YOURS, COLOR.ink)
  s.lanes.forEach((r, lane) => {
    g.put(s.left - 1, r, lane === 0 ? '┌' : '└', COLOR.soft, 0.7)
    g.text(s.right + 2, r, THEIRS, COLOR.ink)
    for (let x = s.left; x <= s.right; x++) {
      if (x === s.cx - HALF || x === s.cx + HALF) continue
      const past = lane === 1 && x > s.cx + HALF ? 1 - blocked : 1
      const drift = Math.floor(x - t * 6)
      const ch = noise(drift, r, 5) > 0.55 ? (HEX[Math.floor(noise(drift, r) * 16)] ?? '·') : '·'
      g.put(x, r, ch, COLOR.mist, 0.5 * past)
    }
  })
  g.put(s.left - 1, mid, '┤', COLOR.soft, 0.7)
}

/** A payment moving along a lane; a refused one breaks up at the gate and its glyphs fall away. */
function drawPacket(g: AsciiGrid, s: Scene, lane: 0 | 1, t0: number, t: number): void {
  const r = s.lanes[lane]
  const reach = s.cx - HALF + 1
  const x = s.left + (t - t0) * 12
  if (x < s.left) return
  const stopped = lane === 1 && x >= reach
  if (!stopped) {
    const arrived = 1 - clamp01((x - s.right + 2) / 5)
    const color = x > s.cx + HALF ? COLOR.jade : COLOR.iris
    for (let k = 0; k < 4; k++) g.put(Math.floor(Math.min(x, s.right)) - k, r, '▶', color, (1 - k * 0.22) * arrived)
    return
  }
  const since = (x - reach) / 12
  for (let k = 0; k < 4; k++) {
    const fall = since * (1.6 + k * 0.7)
    g.put(reach - k + Math.round(since * (k - 1.5)), r + Math.round(fall), '▶', COLOR.seal, clamp01(1 - since * 1.4))
  }
}

function drawReadout(g: AsciiGrid, s: Scene, text: string, color: string, alpha: number): void {
  g.text(Math.floor(s.cx - text.length / 2), s.lanes[1] + 5, text, color, { alpha })
}

function drawAgentGate(g: AsciiGrid): void {
  const t = g.time % LOOP
  const s = sceneOf(g)
  const passed = progress(t, 1.9, 2.1) * (1 - progress(t, 3.4, 3.7))
  const refused = progress(t, 5.5, 5.7) * (1 - progress(t, 7.6, 8.0))
  drawLanes(g, s, g.time, refused)
  drawTorii(g, s, refused > 0 ? COLOR.seal : passed > 0 ? COLOR.jade : null, Math.max(passed, refused))
  drawPacket(g, s, 0, 0.3, t)
  drawPacket(g, s, 1, 3.9, t)
  drawReadout(g, s, 'payTo ✓ registry  ✓ ENS  · signed', COLOR.jade, passed)
  drawReadout(g, s, 'payTo swapped ✕  · refused before signing', COLOR.seal, refused)
}

/** "Agents pay agents": x402 payments pass through a torii that checks each payTo; a swapped one never gets through. */
export function AgentGate() {
  const ref = useAsciiCanvas(drawAgentGate, PIECE)
  return <canvas ref={ref} className="ascii" aria-hidden="true" />
}
