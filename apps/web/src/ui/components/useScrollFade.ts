import { useEffect, type RefObject } from 'react'

/**
 * Marks a sideways-scrolling strip with `data-more-start` / `data-more-end` while there is more to scroll that way,
 * so the `.scroll-fade` style fades only the edges that hide something. `contentKey` re-measures when the strip's
 * items change without the strip itself resizing.
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>, contentKey?: unknown): void {
  useEffect(() => {
    const strip = ref.current
    if (!strip) return
    const update = () => {
      const max = strip.scrollWidth - strip.clientWidth
      strip.dataset.moreStart = String(strip.scrollLeft > 1)
      strip.dataset.moreEnd = String(strip.scrollLeft < max - 1)
    }
    update()
    strip.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(strip)
    return () => {
      strip.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [ref, contentKey])
}

/** Scrolls a strip sideways so its `[aria-current="page"]` item sits in view (centred when it can be). */
export function useCurrentInView(ref: RefObject<HTMLElement | null>, currentKey: string): void {
  useEffect(() => {
    const strip = ref.current
    const current = strip?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!strip || !current) return
    const offset = current.getBoundingClientRect().left - strip.getBoundingClientRect().left
    strip.scrollLeft += offset - (strip.clientWidth - current.offsetWidth) / 2
  }, [ref, currentKey])
}
