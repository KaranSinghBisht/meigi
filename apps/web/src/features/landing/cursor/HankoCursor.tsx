import { useRef } from 'react'
import { useFinePointer } from '../lib/useMediaQuery'
import { useHankoFollow } from './useHankoFollow'
import './cursor.css'

interface HankoCursorProps {
  readonly reducedMotion: boolean
}

/**
 * Vermilion seal ring that trails the pointer, plus a small dot on the exact
 * hotspot so fast clicks never land somewhere the ring isn't. Mouse and
 * trackpad only; forced-colors and high-contrast users keep the system cursor.
 */
export function HankoCursor({ reducedMotion }: HankoCursorProps) {
  const fine = useFinePointer()
  const ring = useRef<HTMLDivElement>(null)
  useHankoFollow(ring, fine, reducedMotion)
  if (!fine) return null
  return (
    <div ref={ring} className="hanko" aria-hidden="true">
      <span className="hanko__track">
        <span className="hanko__ring" />
      </span>
      <span className="hanko__dot" />
    </div>
  )
}
