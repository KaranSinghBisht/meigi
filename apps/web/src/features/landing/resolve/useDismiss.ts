import { useEffect, type RefObject } from 'react'

/**
 * Closes a popover on Escape (restoreFocus = true) or on a pointer press
 * outside it (restoreFocus = false; the caller decides where focus lands).
 */
export function useDismiss(
  open: boolean,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onClose: (restoreFocus: boolean) => void,
): void {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(true)
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (refs.some((ref) => ref.current?.contains(target))) return
      onClose(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, refs, onClose])
}
