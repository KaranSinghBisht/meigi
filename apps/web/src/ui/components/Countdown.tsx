import { useEffect, useRef } from 'react'
import { formatCountdown, formatJst } from '../../lib/chain/format'
import { useNow } from '../../lib/hooks/useNow'
import './data.css'

interface CountdownProps {
  readonly to: Date
  /** Called once when the countdown reaches zero (e.g. to re-read the chain). */
  readonly onElapsed?: () => void
  readonly className?: string
}

/** HH:MM:SS until `to`. Screen readers get the absolute time instead of a number that changes every second. */
export function Countdown({ to, onElapsed, className }: CountdownProps) {
  const now = useNow(1000)
  const remaining = (to.getTime() - now) / 1000
  const fired = useRef(false)

  useEffect(() => {
    if (remaining > 0 || fired.current) return
    fired.current = true
    onElapsed?.()
  }, [remaining, onElapsed])

  return (
    <time className={className ? `countdown ${className}` : 'countdown'} dateTime={to.toISOString()}>
      <span aria-hidden="true">{formatCountdown(remaining)}</span>
      <span className="sr-only">{`at ${formatJst(to)}`}</span>
    </time>
  )
}
