import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDismiss } from './useDismiss'

/**
 * Open state and focus management for the resolver popover: opening focuses
 * the input, Escape returns focus to the trigger, and a click outside never
 * strands focus on <body>.
 */
export function usePopover(onClosed: () => void) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const insideRefs = useMemo(() => [panel, trigger], [])

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) {
      trigger.current?.focus()
      return
    }
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) trigger.current?.focus({ preventScroll: true })
    })
  }, [])

  useDismiss(open, insideRefs, close)

  useEffect(() => {
    if (open) input.current?.focus()
    else onClosed()
  }, [open, onClosed])

  const toggle = useCallback(() => setOpen((was) => !was), [])
  return { open, toggle, trigger, panel, input }
}
