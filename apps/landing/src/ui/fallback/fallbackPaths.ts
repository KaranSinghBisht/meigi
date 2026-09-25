import { RIM, SNOW_LINE, fujiProfile, fujiRadiusAt } from '../../scene/fuji/fujiProfile'
import { valueNoise } from '../../scene/shared/noise'

// Geometry for the static SVG scene, in a 1600 × 1000 viewBox.
export const VIEW = { width: 1600, height: 1000, horizon: 600 } as const

const FUJI = { cx: 800, height: 340, radius: 1040 } as const

function pointAt(s: number, side: -1 | 1): string {
  const x = FUJI.cx + side * s * FUJI.radius
  const y = VIEW.horizon - fujiProfile(s) * FUJI.height
  return `${x.toFixed(1)} ${y.toFixed(1)}`
}

/** Closed silhouette from the left base, over the flat summit, to the right base. */
export function fujiSilhouette(): string {
  const steps = 60
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= steps; i++) {
    const s = 1 - (i / steps) * (1 - RIM)
    left.push(pointAt(s, -1))
    right.unshift(pointAt(s, 1))
  }
  return `M ${left.join(' L ')} L ${right.join(' L ')} L ${FUJI.cx + FUJI.radius} ${VIEW.horizon + 20} L ${
    FUJI.cx - FUJI.radius
  } ${VIEW.horizon + 20} Z`
}

/** Snow cap: the summit above the snow line, with streaks reaching down gullies. */
export function fujiSnowCap(): string {
  const edge = fujiRadiusAt(SNOW_LINE)
  const top: string[] = []
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const s = edge - (i / steps) * (edge - RIM)
    top.push(pointAt(s, -1))
  }
  for (let i = 0; i <= steps; i++) top.push(pointAt(RIM + (i / steps) * (edge - RIM), 1))

  const streaks: string[] = []
  const count = 72
  const lineY = VIEW.horizon - SNOW_LINE * FUJI.height
  for (let i = count; i >= 0; i--) {
    const u = i / count
    const x = FUJI.cx + (u * 2 - 1) * edge * FUJI.radius
    const envelope = Math.sin(u * Math.PI)
    const reach = Math.pow(valueNoise(u * 31, 2.3), 3) * 72 * envelope
    const ragged = (valueNoise(u * 97, 7.1) - 0.5) * 6 * envelope
    streaks.push(`${x.toFixed(1)} ${(lineY + reach + ragged).toFixed(1)}`)
  }
  return `M ${top.join(' L ')} L ${streaks.join(' L ')} Z`
}

/** Low rolling ridge along the far shore. */
export function ridge(baseY: number, amp: number, scale: number, seed: number): string {
  const points: string[] = []
  for (let x = -20; x <= VIEW.width + 20; x += 20) {
    const y = baseY - valueNoise(x / scale + seed, seed) * amp - valueNoise(x / 18, seed + 3) * 3
    points.push(`${x} ${y.toFixed(1)}`)
  }
  return `M ${points.join(' L ')} L ${VIEW.width + 20} ${VIEW.horizon + 12} L -20 ${VIEW.horizon + 12} Z`
}
