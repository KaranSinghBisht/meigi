import { useEffect, type RefObject } from 'react'

/**
 * Marks a vertically scrolling list with `data-more-above` / `data-more-below` while there is more to scroll that
 * way, so its CSS fades only the edges that hide rows. `contentKey` re-measures when the rows change.
 */
export function useEdgeFade(ref: RefObject<HTMLElement | null>, contentKey?: unknown): void {
  useEffect(() => {
    const list = ref.current
    if (!list) return
    const update = () => {
      const max = list.scrollHeight - list.clientHeight
      list.dataset.moreAbove = String(list.scrollTop > 1)
      list.dataset.moreBelow = String(list.scrollTop < max - 1)
    }
    update()
    list.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(list)
    return () => {
      list.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [ref, contentKey])
}
