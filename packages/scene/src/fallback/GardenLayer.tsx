import { useId, useMemo } from 'react'
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
const COSMOS = ['#FFF4E9', '#EBC5CE', '#D991AF', '#A85279'] as const

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
    for (let i = 0; i < 150; i++) {
      const t = Math.pow(random(), 0.8)
      const x = mirrorX(t * 390 + (random() - 0.5) * 40, side)
      flowers.push({ x, y: 830 + t * 150 + random() * 70, r: 2.4 + t * 3 + random() * 2.8, fill: pick(COSMOS, Math.pow(random(), 0.6)) })
    }
  }
  for (let cluster = 0; cluster < 24; cluster++) {
    const anchor = random() * VIEW.width
    for (let i = 0; i < 5; i++) {
      flowers.push({ x: anchor + (random() - 0.5) * 85, y: 978 + random() * 28, r: 3.5 + random() * 4, fill: pick(COSMOS, random()) })
    }
  }
  flowers.sort((a, b) => a.y - b.y)
  return { flowers, spikes }
}

export function GardenLayer() {
  const bloomId = useId()
  const { domes, flowers, spikes } = useMemo(() => {
    const random = seededRandom(20260928)
    return { domes: hedges(random), ...blooms(random) }
  }, [])
  return (
    <g>
      <defs>
        <g id={bloomId}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <path key={angle} transform={`rotate(${angle})`}
              d="M-.1 -.12 C-.36 -.3,-.48 -.72,-.28 -.96 L-.12 -.88 0 -1 .13 -.88 .28 -.94 C.43 -.65,.3 -.29,.1 -.12Z"
              fill="currentColor" />
          ))}
          <circle r=".2" fill="#BA843E" />
          <circle cx="-.04" cy="-.04" r=".13" fill="#E9C779" />
        </g>
      </defs>
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
      <g fill="none" stroke="#71846D" strokeWidth="0.7" opacity="0.65">
        {flowers.map((b, i) => (
          <path key={i} d={`M${b.x} ${b.y + b.r * 4} Q${b.x + b.r} ${b.y + b.r * 2} ${b.x} ${b.y}`} />
        ))}
      </g>
      {flowers.map((b, i) => (
        <use key={i} href={`#${bloomId}`} color={b.fill}
          transform={`translate(${b.x} ${b.y}) rotate(${i * 137.5}) scale(${b.r} ${b.r * (0.65 + (i % 4) * 0.1)})`} />
      ))}
    </g>
  )
}
