import { useState } from 'react'

export type Direction = 'none' | 'forward' | 'back'

/** Which way the last screen change went, so the new screen slides in from that side. None on first paint. */
export function useDirection(screen: number): Direction {
  const [seen, setSeen] = useState<{ screen: number; direction: Direction }>({ screen, direction: 'none' })
  if (seen.screen === screen) return seen.direction
  const direction: Direction = screen > seen.screen ? 'forward' : 'back'
  setSeen({ screen, direction })
  return direction
}
