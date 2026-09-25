import { useCallback, useRef, useState, type CSSProperties } from 'react'
import './cursor.css'

export interface Stamp {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly angle: number
}

const MAX_STAMPS = 6

export function useSealStamps() {
  const [stamps, setStamps] = useState<readonly Stamp[]>([])
  const nextId = useRef(0)

  const stamp = useCallback((x: number, y: number) => {
    const id = nextId.current++
    const angle = (Math.random() * 2 - 1) * 9
    setStamps((list) => [...list.slice(-(MAX_STAMPS - 1)), { id, x, y, angle }])
  }, [])

  const remove = useCallback((id: number) => {
    setStamps((list) => list.filter((item) => item.id !== id))
  }, [])

  return { stamps, stamp, remove }
}

/** Grainy, slightly rough edges: paper fibre showing through the ink. */
function InkFilter() {
  return (
    <svg className="seals__defs" width="0" height="0" focusable="false">
      <defs>
        <filter id="meigi-ink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="grain" />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.4"
            result="speckle"
          />
          <feComposite in="SourceGraphic" in2="speckle" operator="in" result="inked" />
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="9" result="warp" />
          <feDisplacementMap in="inked" in2="warp" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  )
}

/** Hakubun seal (白文印): paper-white characters cut out of a solid vermilion block. */
function Seal({ stamp, onDone }: { readonly stamp: Stamp; readonly onDone: (id: number) => void }) {
  const style = { left: stamp.x, top: stamp.y, '--seal-angle': `${stamp.angle}deg` } as CSSProperties
  return (
    <svg className="seal" viewBox="0 0 100 100" style={style} onAnimationEnd={() => onDone(stamp.id)}>
      <g filter="url(#meigi-ink)">
        <rect x="6" y="6" width="88" height="88" rx="9" fill="currentColor" />
        <text x="50" y="46" textAnchor="middle" className="seal__glyph">
          名
        </text>
        <text x="50" y="88" textAnchor="middle" className="seal__glyph">
          義
        </text>
      </g>
    </svg>
  )
}

interface SealLayerProps {
  readonly stamps: readonly Stamp[]
  readonly onDone: (id: number) => void
}

export function SealLayer({ stamps, onDone }: SealLayerProps) {
  return (
    <div className="seals" aria-hidden="true">
      <InkFilter />
      {stamps.map((item) => (
        <Seal key={item.id} stamp={item} onDone={onDone} />
      ))}
    </div>
  )
}
