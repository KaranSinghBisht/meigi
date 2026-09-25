import { useEffect, useRef, useState } from 'react'
import { copyText } from './clipboard'

type CopyState = 'idle' | 'copied' | 'failed'

const RESET_MS = 1500

interface CopyPillProps {
  readonly label: string
  readonly text: string
}

/** Copies an install command; the pill itself confirms with "Copied". */
export function CopyPill({ label, text }: CopyPillProps) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onClick = async () => {
    window.clearTimeout(timer.current)
    try {
      await copyText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    timer.current = window.setTimeout(() => setState('idle'), RESET_MS)
  }

  const visible = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label
  return (
    <>
      <button
        type="button"
        className="pill pill--copy"
        onClick={onClick}
        aria-label={`${label}: copy "${text}"`}
        title={text}
      >
        {visible}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </>
  )
}
