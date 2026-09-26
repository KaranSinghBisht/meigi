import { useState } from 'react'
import { Button } from '../../../ui/components/Button'

interface StartOverProps {
  readonly onReset: () => void
  /** After registering, starting again is simply the next company: no question asked. */
  readonly finished?: boolean
  readonly className?: string
}

/** Starting over throws away every answer (and a wallet made here), so it asks once before it does. */
export function StartOver({ onReset, finished = false, className }: StartOverProps) {
  const [asking, setAsking] = useState(false)
  if (finished || !asking) {
    return (
      <Button variant="quiet" size="sm" className={className} onClick={finished ? onReset : () => setAsking(true)}>
        {finished ? 'Register another company' : 'Start over'}
      </Button>
    )
  }
  return (
    <div className="start-over" role="group" aria-label="Start over">
      <span className="start-over__text">Clear every step?</span>
      <Button variant="ghost" size="sm" onClick={onReset}>
        Clear
      </Button>
      <Button variant="quiet" size="sm" onClick={() => setAsking(false)}>
        Keep
      </Button>
    </div>
  )
}
