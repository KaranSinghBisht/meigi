import { useMemo } from 'react'
import { seededRandom } from '@meigi/scene/lite'

interface Blossom {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly turn: number
  readonly bud: boolean
}

// Branch enters from the top-left corner; twigs fork off it.
const MAIN = 'M-30 34 C 70 58, 150 70, 250 112 S 410 178, 500 206'
const TWIGS = [
  'M120 70 C 150 40, 178 26, 214 18',
  'M232 106 C 250 140, 262 170, 268 214',
  'M330 150 C 360 120, 392 104, 430 98',
  'M60 50 C 70 90, 64 126, 50 160',
]

// Points along the branch and twigs where flowers cluster.
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [96, 60], [150, 44], [206, 22], [184, 88], [246, 116], [262, 176], [270, 214],
  [318, 146], [372, 116], [428, 100], [410, 176], [470, 196], [58, 118], [48, 160], [20, 44],
]

function createBlossoms(): Blossom[] {
  const random = seededRandom(1107)
  return ANCHORS.flatMap(([ax, ay]) =>
    Array.from({ length: 2 }, () => ({
      x: ax + (random() - 0.5) * 30,
      y: ay + (random() - 0.5) * 24,
      size: 0.7 + random() * 0.55,
      turn: random() * 72,
      bud: random() < 0.18,
    })),
  )
}

function Flower({ blossom }: { readonly blossom: Blossom }) {
  const { x, y, size, turn, bud } = blossom
  if (bud) return <circle cx={x} cy={y} r={5 * size} fill="#EE9FB7" />
  return <use href="#sakura-flower" transform={`translate(${x} ${y}) rotate(${turn}) scale(${size})`} />
}

/** Soft, out-of-focus cherry branch framing the top-left corner. */
export function BlossomBranch() {
  const blossoms = useMemo(createBlossoms, [])
  return (
    <svg className="branch" viewBox="0 0 520 300" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="sakura-petal" cx="50%" cy="85%" r="85%">
          <stop offset="0" stopColor="#F3A9BF" />
          <stop offset="0.55" stopColor="#F9CFDC" />
          <stop offset="1" stopColor="#FFF1F5" />
        </radialGradient>
        <g id="sakura-flower">
          {[0, 72, 144, 216, 288].map((angle) => (
            <path
              key={angle}
              transform={`rotate(${angle})`}
              d="M0 -2 C -7 -6, -9 -15, -5 -20 L 0 -17 L 5 -20 C 9 -15, 7 -6, 0 -2 Z"
              fill="url(#sakura-petal)"
            />
          ))}
          <circle r="3" fill="#D8718F" />
        </g>
      </defs>
      <g fill="none" stroke="#6B5260" strokeLinecap="round">
        <path d={MAIN} strokeWidth="9" />
        {TWIGS.map((d) => (
          <path key={d} d={d} strokeWidth="4" />
        ))}
      </g>
      {blossoms.map((blossom, index) => (
        <Flower key={index} blossom={blossom} />
      ))}
    </svg>
  )
}
