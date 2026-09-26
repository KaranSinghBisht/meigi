import { useFrame } from '@react-three/fiber'
import { FRAME } from './sceneBus'

const SAMPLES = 30
const MIN_INTERVAL = 1 / 240
const MAX_INTERVAL = 1 / 24
const MAX_STEP = 0.1
/** Longer gaps than this are pauses (hidden tab, idle demand mode), not slow frames. */
const PAUSE = 0.25

/**
 * Animation clock that advances in whole display frames. R3F's delta is
 * performance.now() sampled inside the callback, which carries a millisecond
 * or two of scheduling noise; at glide speeds that shows up as uneven steps.
 * Here every frame advances by exactly one refresh interval (two after a
 * dropped frame), measured from the vsync-aligned frame time.
 */
class FrameClock {
  /** Seconds to advance animations by this frame. */
  dt = 0
  private last = -1
  private interval = 1 / 60
  private readonly samples: number[] = []

  tick(nowMs: number): void {
    const raw = this.last < 0 ? 0 : (nowMs - this.last) / 1000
    this.last = nowMs
    if (raw <= 0) {
      this.dt = 0
      return
    }
    if (raw > PAUSE) {
      this.dt = this.interval
      return
    }
    this.track(raw)
    this.dt = Math.min(Math.max(1, Math.round(raw / this.interval)) * this.interval, MAX_STEP)
  }

  /**
   * Rolling median of recent frame gaps: the display's refresh interval.
   * Only back-to-back frames count; on-demand renders (a startup pump every
   * 60 ms, one-off wakes) would otherwise read as a slow display.
   */
  private track(raw: number): void {
    if (raw > this.interval * 2.5) return
    this.samples.push(raw)
    if (this.samples.length > SAMPLES) this.samples.shift()
    const sorted = [...this.samples].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? raw
    this.interval = Math.min(Math.max(median, MIN_INTERVAL), MAX_INTERVAL)
  }
}

export const frameClock = new FrameClock()

function frameTimeMs(): number {
  const time = document.timeline.currentTime
  return typeof time === 'number' ? time : performance.now()
}

/** Ticks the shared clock once per rendered frame, before anything animates. */
export function FrameClockDriver() {
  useFrame(() => frameClock.tick(frameTimeMs()), FRAME.clock)
  return null
}
