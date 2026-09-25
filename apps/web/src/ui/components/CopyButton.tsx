import { useEffect, useState } from 'react'
import './data.css'

type CopyState = 'idle' | 'copied' | 'failed'

/** Copies `value` to the clipboard and says so for 1.5 s. */
export function CopyButton({ value, label = 'Copy' }: { readonly value: string; readonly label?: string }) {
  const [state, setState] = useState<CopyState>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 1500)
    return () => window.clearTimeout(timer)
  }, [state])

  const copy = () => {
    navigator.clipboard.writeText(value).then(
      () => setState('copied'),
      () => setState('failed'),
    )
  }

  const text = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label
  return (
    <button type="button" className="copy" onClick={copy} aria-live="polite">
      {text}
    </button>
  )
}
