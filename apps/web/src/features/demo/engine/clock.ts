// The one clock behind the player. It owns the playhead; the GSAP master timeline stays paused and is only ever
// set to the clock's time, so captions, cursor, panels and chapter chips can never drift apart, and a chapter
// can be jumped to by setting the time. React reads a coarse snapshot (chapter, caption, play state); the
// per-frame time goes to frame listeners that write to the DOM directly.

import gsap from 'gsap'
import { captionAt, chapterAt, stepAt } from './script'
import type { Script } from './types'

export type Speed = 1 | 1.5
/** Why the playhead is held without being paused: hovering the agent panel, offscreen, or a hidden tab. */
export type Hold = 'hover' | 'offscreen' | 'hidden'

export interface ClockSnapshot {
  readonly playing: boolean
  readonly speed: Speed
  readonly chapter: number
  readonly caption: number
  readonly step: number
  readonly held: boolean
}

type Frame = (time: number) => void
/** Frames longer than this (a background tab, a debugger) don't jump the story ahead. */
const MAX_FRAME_MS = 100

export class DemoClock {
  private timeline: gsap.core.Timeline | null = null
  private time = 0
  private playing: boolean
  private speed: Speed = 1
  private readonly holds = new Set<Hold>()
  private snapshot: ClockSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly frames = new Set<Frame>()

  constructor(
    private readonly script: Script,
    autoplay: boolean,
    startAt = 0,
  ) {
    this.playing = autoplay
    this.time = Math.min(Math.max(startAt, 0), script.duration)
    this.snapshot = this.read()
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): ClockSnapshot => this.snapshot

  onFrame(frame: Frame): () => void {
    this.frames.add(frame)
    frame(this.time)
    return () => this.frames.delete(frame)
  }

  get now(): number {
    return this.time
  }

  get total(): number {
    return this.script.duration
  }

  /** Attaches a freshly built master timeline and draws the current time on it. */
  attach(timeline: gsap.core.Timeline | null): void {
    this.timeline = timeline
    timeline?.time(this.time)
  }

  start(): () => void {
    gsap.ticker.add(this.tick)
    return () => gsap.ticker.remove(this.tick)
  }

  private readonly tick = (_time: number, deltaMs: number): void => {
    if (!this.playing || this.holds.size > 0) return
    const next = this.time + (Math.min(deltaMs, MAX_FRAME_MS) / 1000) * this.speed
    this.seek(next >= this.script.duration ? 0 : next)
  }

  seek(time: number): void {
    this.time = Math.min(Math.max(time, 0), this.script.duration)
    this.timeline?.time(this.time)
    this.frames.forEach((frame) => frame(this.time))
    this.publish()
  }

  setPlaying(playing: boolean): void {
    this.playing = playing
    this.publish()
  }

  setSpeed(speed: Speed): void {
    this.speed = speed
    this.publish()
  }

  hold(reason: Hold, on: boolean): void {
    if (on) this.holds.add(reason)
    else this.holds.delete(reason)
    this.publish()
  }

  jumpToChapter(index: number): void {
    const chapter = this.script.chapters[index]
    if (chapter) this.seek(chapter.start)
  }

  /** Reduced motion: moves one beat, drawn in its final state. */
  step(delta: 1 | -1): void {
    const { steps } = this.script
    const next = Math.min(Math.max(stepAt(this.script, this.time) + delta, 0), steps.length - 1)
    const time = steps[next]
    if (time !== undefined) this.seek(time)
  }

  private read(): ClockSnapshot {
    return {
      playing: this.playing,
      speed: this.speed,
      chapter: chapterAt(this.script, this.time),
      caption: captionAt(this.script, this.time),
      step: stepAt(this.script, this.time),
      held: this.holds.size > 0,
    }
  }

  private publish(): void {
    const next = this.read()
    const prev = this.snapshot
    const same = (Object.keys(next) as (keyof ClockSnapshot)[]).every((key) => next[key] === prev[key])
    if (same) return
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }
}
