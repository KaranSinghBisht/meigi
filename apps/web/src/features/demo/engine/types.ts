import type { Geo } from './geometry'

export interface CaptionDef {
  /** Seconds from the chapter's start. */
  readonly at: number
  readonly text: string
}

/** What a chapter builder gets: the master timeline and scoped lookups into the stage. */
export interface BuildCtx {
  readonly tl: gsap.core.Timeline
  /** The chapter's start on the master timeline; builders place tweens at `t0 + seconds`. */
  readonly t0: number
  /** The one element marked data-d="name"; throws if the stage doesn't render it. */
  readonly el: (name: string) => HTMLElement
  readonly all: (name: string) => HTMLElement[]
  readonly geo: Geo
  readonly portrait: boolean
}

export interface ChapterDef {
  readonly id: string
  /** The chip's label. */
  readonly title: string
  readonly duration: number
  readonly captions: readonly CaptionDef[]
  readonly build: (ctx: BuildCtx) => void
}

export interface Caption {
  readonly start: number
  readonly end: number
  readonly text: string
  readonly chapter: number
}

export interface Script {
  readonly chapters: readonly (ChapterDef & { readonly start: number })[]
  readonly captions: readonly Caption[]
  /** Reduced motion: the times Next/Back stop at (each caption's beat, fully drawn). */
  readonly steps: readonly number[]
  readonly duration: number
}
