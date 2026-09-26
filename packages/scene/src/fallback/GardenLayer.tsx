import { useMemo } from 'react'
import { seededRandom } from '../shared/noise'
import { VIEW } from './fallbackPaths'

// The Oishi Park beds for the static scene: a soft bank in each lower corner
// with short kochia hedges, lavender and drifts of cosmos, and a low fringe of
// cosmos along the bottom so the tall (centre-cropped) phone slice shows the
// garden too. Fuji's mirrored summit, down to about y = 940 in the middle,
// stays clear.

interface Mark {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly fill: string
}

const BANK_LEFT = 'M -20 776 C 150 782, 300 850, 392 1010 L -20 1010 Z'
const BANK_RIGHT = `M ${VIEW.width + 20} 776 C ${VIEW.width - 150} 782, ${VIEW.width - 300} 850, ${VIEW.width - 392} 1010 L ${VIEW.width + 20} 1010 Z`
const KOCHIA = ['#B8C46A', '#EE9A7E', '#CF4F66', '#B9487F'] as const
const COSMOS = ['#FFF6F8', '#F4C6D6', '#EA8FB4', '#C8508E'] as const

function mirrorX(x: number, side: number): number {
  return side < 0 ? x : VIEW.width - x
}

function pick<T>(list: readonly T[], t: number): T {
  return list[Math.min(list.length - 1, Math.floor(t * list.length))] as T
}

/** Short hedges of touching domes along each bank's water edge. */
function hedges(random: () => number): Mark[] {
  const domes: Mark[] = []
  for (const side of [-1, 1]) {
    let t = 0
    while (t < 1) {
      const fill = pick(KOCHIA, random())
      for (let i = 0; i < 3 + Math.floor(random() * 3) && t < 1; i++) {
        const r = 11 + t * 13 + random() * 4
        domes.push({ x: mirrorX(10 + t * 290, side), y: 790 + t * 110, r, fill })
        t += (r * 1.45) / 320
      }
      t += 0.05 + random() * 0.06
    }
  }
  return domes
}

function blooms(random: () => number): { flowers: Mark[]; spikes: Mark[] } {
  const flowers: Mark[] = []
  const spikes: Mark[] = []
  for (const side of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const t = random()
      spikes.push({ x: mirrorX(20 + t * 300, side), y: 872 + t * 100, r: 13 + random() * 6, fill: '#8F7CC6' })
    }
    for (let i = 0; i < 220; i++) {
      const t = Math.pow(random(), 0.8)
      const x = mirrorX(t * 390 + (random() - 0.5) * 40, side)
      flowers.push({ x, y: 830 + t * 150 + random() * 70, r: 3 + random() * 3.5, fill: pick(COSMOS, Math.pow(random(), 0.6)) })
    }
  }
  for (let i = 0; i < 160; i++) {
    flowers.push({ x: random() * VIEW.width, y: 972 + random() * 30, r: 2.8 + random() * 2.6, fill: pick(COSMOS, Math.pow(random(), 0.6)) })
  }
  return { flowers, spikes }
}

export function GardenLayer() {
  const { domes, flowers, spikes } = useMemo(() => {
    const random = seededRandom(20260928)
    return { domes: hedges(random), ...blooms(random) }
  }, [])
  return (
    <g>
      <g filter="url(#fb-fluff)">
        <path d={BANK_LEFT} fill="#9FA893" />
        <path d={BANK_RIGHT} fill="#9FA893" />
        {domes.map((d) => (
          <ellipse key={`${d.x}-${d.y}`} cx={d.x} cy={d.y - d.r * 0.85} rx={d.r} ry={d.r * 1.05} fill={d.fill} />
        ))}
      </g>
      {spikes.map((s) => (
        <line key={`${s.x}-${s.y}`} x1={s.x} y1={s.y} x2={s.x} y2={s.y - s.r * 2} stroke={s.fill} strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      ))}
      {flowers.map((b) => (
        <g key={`${b.x}-${b.y}`}>
          <circle cx={b.x} cy={b.y} r={b.r} fill={b.fill} />
          <circle cx={b.x} cy={b.y} r={b.r * 0.3} fill="#F2C14E" />
        </g>
      ))}
    </g>
  )
}
