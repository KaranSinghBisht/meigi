import { useEffect, type RefObject } from 'react'

const INTERACTIVE = 'a[href], button, input, textarea, select, label, [role="button"], [data-cursor="press"]'
const FOLLOW_RATE = 16

interface Follow {
  x: number
  y: number
  tx: number
  ty: number
  frame: number
  last: number
  shown: boolean
}

function hotTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE) !== null
}

/** Moves the ring towards the pointer with a frame-rate independent lerp. */
function createLoop(track: HTMLElement, state: Follow, instant: boolean) {
  const render = (now: number) => {
    const dt = Math.min((now - state.last) / 1000, 0.1)
    state.last = now
    const k = instant ? 1 : 1 - Math.exp(-FOLLOW_RATE * dt)
    state.x += (state.tx - state.x) * k
    state.y += (state.ty - state.y) * k
    track.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`
    const settled = Math.abs(state.tx - state.x) + Math.abs(state.ty - state.y) < 0.1
    state.frame = settled ? 0 : requestAnimationFrame(render)
  }
  return () => {
    if (state.frame) return
    state.last = performance.now()
    state.frame = requestAnimationFrame(render)
  }
}

function createHandlers(el: HTMLElement, dot: HTMLElement, state: Follow, kick: () => void) {
  return {
    onMove: (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      state.tx = event.clientX
      state.ty = event.clientY
      dot.style.transform = `translate3d(${state.tx}px, ${state.ty}px, 0)`
      if (!state.shown) {
        state.x = state.tx
        state.y = state.ty
        state.shown = true
        // The system cursor goes only once the ring can take its place.
        document.documentElement.classList.add('has-hanko')
        el.classList.add('is-visible')
      }
      kick()
    },
    onOver: (event: PointerEvent) => el.classList.toggle('is-hot', hotTarget(event.target)),
    onDown: () => el.classList.add('is-pressed'),
    onUp: () => el.classList.remove('is-pressed'),
    onLeave: () => {
      state.shown = false
      el.classList.remove('is-visible', 'is-pressed')
    },
  }
}

/** Drives the hanko ring: follow, fill over interactive elements, press, hide. */
export function useHankoFollow(ref: RefObject<HTMLElement | null>, enabled: boolean, instant: boolean): void {
  useEffect(() => {
    const el = ref.current
    const track = el?.querySelector<HTMLElement>('.hanko__track')
    const dot = el?.querySelector<HTMLElement>('.hanko__dot')
    if (!enabled || !el || !track || !dot) return
    const root = document.documentElement
    const state: Follow = { x: 0, y: 0, tx: 0, ty: 0, frame: 0, last: 0, shown: false }
    const on = createHandlers(el, dot, state, createLoop(track, state, instant))

    window.addEventListener('pointermove', on.onMove, { passive: true })
    document.addEventListener('pointerover', on.onOver, { passive: true })
    window.addEventListener('pointerdown', on.onDown, { passive: true })
    window.addEventListener('pointerup', on.onUp, { passive: true })
    root.addEventListener('pointerleave', on.onLeave)
    window.addEventListener('blur', on.onLeave)
    return () => {
      root.classList.remove('has-hanko')
      window.removeEventListener('pointermove', on.onMove)
      document.removeEventListener('pointerover', on.onOver)
      window.removeEventListener('pointerdown', on.onDown)
      window.removeEventListener('pointerup', on.onUp)
      root.removeEventListener('pointerleave', on.onLeave)
      window.removeEventListener('blur', on.onLeave)
      cancelAnimationFrame(state.frame)
    }
  }, [ref, enabled, instant])
}
