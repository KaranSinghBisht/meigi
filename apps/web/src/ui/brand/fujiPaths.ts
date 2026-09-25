// Static Fuji silhouette for the app backdrop: concave flanks, a flat crater rim and a ragged snow line,
// generated once as SVG path strings in a 1600 × 440 viewBox.

export const VIEW = { width: 1600, height: 440, horizon: 330 } as const

const FUJI = { cx: 800, halfBase: 640, height: 168, rim: 0.05, flank: 1.9, snow: 0.6 } as const

/** Height (0..1) at normalised distance s (0 = summit axis, 1 = base). */
function heightAt(s: number): number {
  if (s <= FUJI.rim) return 1
  const t = (s - FUJI.rim) / (1 - FUJI.rim)
  return Math.pow(1 - t, FUJI.flank)
}

function point(s: number, side: -1 | 1): [number, number] {
  return [FUJI.cx + side * s * FUJI.halfBase, VIEW.horizon - heightAt(s) * FUJI.height]
}

function toPath(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
}

function outline(fromS: number, toS: number, steps: number): Array<[number, number]> {
  const left: Array<[number, number]> = []
  const right: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const s = fromS - (i / steps) * (fromS - toS)
    left.push(point(s, -1))
    right.unshift(point(s, 1))
  }
  return [...left, ...right]
}

export function mountainPath(): string {
  const points = outline(1, 0, 90)
  return `${toPath(points)} L${FUJI.cx + FUJI.halfBase} ${VIEW.horizon + 2} L${FUJI.cx - FUJI.halfBase} ${VIEW.horizon + 2} Z`
}

/** Snow above the snow line, with streaks running down the gullies (deterministic, no randomness). */
export function snowPath(): string {
  const edge = FUJI.rim + (1 - FUJI.rim) * (1 - Math.pow(FUJI.snow, 1 / FUJI.flank))
  const top = outline(edge, 0, 30)
  const lineY = VIEW.horizon - FUJI.snow * FUJI.height
  const streaks: Array<[number, number]> = []
  const count = 34
  for (let i = count; i >= 0; i--) {
    const u = i / count
    const envelope = Math.sin(u * Math.PI)
    const reach = (0.5 + 0.5 * Math.sin(u * 47.3) * Math.cos(u * 19.1)) * 26 * envelope
    streaks.push([FUJI.cx + (u * 2 - 1) * edge * FUJI.halfBase, lineY + (i % 2 === 0 ? reach : reach * 0.35)])
  }
  return `${toPath([...top, ...streaks])} Z`
}

/** A low far shore so the mountain doesn't float. */
export function shorePath(): string {
  const points: Array<[number, number]> = []
  for (let x = -20; x <= VIEW.width + 20; x += 40) {
    const y = VIEW.horizon - 10 - (Math.sin(x / 140) + Math.sin(x / 57 + 1.3) * 0.5 + 1.5) * 5
    points.push([x, y])
  }
  return `${toPath(points)} L${VIEW.width + 20} ${VIEW.horizon + 2} L-20 ${VIEW.horizon + 2} Z`
}
