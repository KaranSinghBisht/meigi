import gsap from 'gsap'
import { TextPlugin } from 'gsap/TextPlugin'
import { useLayoutEffect, type RefObject } from 'react'
import type { DemoClock } from './clock'
import { createGeo } from './geometry'
import type { BuildCtx, Script } from './types'

gsap.registerPlugin(TextPlugin)

function lookups(stage: HTMLElement): Pick<BuildCtx, 'el' | 'all'> {
  const all = (name: string): HTMLElement[] =>
    Array.from(stage.querySelectorAll(`[data-d="${name}"]`)).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    )
  const el = (name: string): HTMLElement => {
    const [found] = all(name)
    if (!found) throw new Error(`the demo stage has no element named "${name}"`)
    return found
  }
  return { el, all }
}

interface TimelineOptions {
  readonly stageRef: RefObject<HTMLElement | null>
  readonly clock: DemoClock
  readonly script: Script
  readonly designWidth: number
  readonly portrait: boolean
  readonly onError: (message: string) => void
}

/**
 * Builds the master timeline from the chapters (rebuilt when the layout changes) and hands it to the clock.
 * Everything a chapter animates is reverted on rebuild, so the stage returns to its CSS start state first.
 */
export function useDemoTimeline({ stageRef, clock, script, designWidth, portrait, onError }: TimelineOptions): void {
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const context = gsap.context(() => undefined, stage)
    try {
      context.add(() => {
        const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } })
        const geo = createGeo(stage, designWidth)
        const { el, all } = lookups(stage)
        for (const chapter of script.chapters) chapter.build({ tl, t0: chapter.start, el, all, geo, portrait })
        tl.set({}, {}, script.duration)
        clock.attach(tl)
      })
    } catch (error) {
      // A chapter that can't find its elements is a bug in the player: show it instead of animating around it.
      context.revert()
      onError(error instanceof Error ? error.message : 'the demo timeline could not be built')
    }
    return () => {
      clock.attach(null)
      context.revert()
    }
  }, [stageRef, clock, script, designWidth, portrait, onError])
}
