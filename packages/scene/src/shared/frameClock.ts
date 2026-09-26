import { useFrame } from '@react-three/fiber'
import { FRAME } from './sceneBus'

const SAMPLES = 30
const MIN_INTERVAL = 1 / 240
const MAX_INTERVAL = 1 / 24
const MAX_STEP = 0.1
/** Longer gaps than this are pauses (hidden tab, idle demand mode), not slow frames. */
const PAUSE = 0.25
/** A real refresh-rate change moves the median by far more than frame-time jitter does. */
const RETUNE = 0.04
/** Common display refresh rates (Hz). A measured interval within SNAP of one is taken as exact. */
const REFRESH_RATES = [240, 165, 144, 120, 100, 90, 85, 75, 72, 70, 60, 50, 48, 30]
const SNAP = 0.05

function snapToRefresh(seconds: number): number {
  let best = seconds
  let bestError = SNAP
  for (const hz of REFRESH_RATES) {
    const error = Math.abs(seconds * hz - 1)
    if (error < bestError) {
      best = 1 / hz
      bestError = error
    }
  }
  return best
}

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
   * The display's refresh interval: the rolling median of recent frame gaps,
   * snapped to a common refresh rate when it is close to one. Only
   * back-to-back frames count; on-demand renders (a startup pump every 60 ms,
   * one-off wakes) would otherwise read as a slow display. Frame times come in
   * 0.1 ms steps with up to a millisecond of jitter, so the raw median flips
   * between neighbours (8.3 / 8.4 ms at 120 Hz); snapped, and held once the
   * window is full until the median moves by more than RETUNE, every frame
   * advances by exactly the same step.
   */
  private track(raw: number): void {
    if (raw > this.interval * 2.5) return
    this.samples.push(raw)
    if (this.samples.length > SAMPLES) this.samples.shift()
    const sorted = [...this.samples].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? raw
    const steady = this.samples.length === SAMPLES && Math.abs(median - this.interval) <= this.interval * RETUNE
    if (!steady) this.interval = Math.min(Math.max(snapToRefresh(median), MIN_INTERVAL), MAX_INTERVAL)
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
