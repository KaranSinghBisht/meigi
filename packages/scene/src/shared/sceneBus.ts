import type { SceneMood } from '../types'

// Mutable, render-rate state shared between the DOM and the scene. Kept outside
// React so pointer moves and mood changes never re-render, and three.js-free
// so UI code can reach it through sceneEvents without loading the canvas.

export interface WaterDrop {
  readonly x: number
  readonly z: number
  /** Gaussian radius in world units */
  readonly radius: number
  /** Signed height added at the centre */
  readonly amplitude: number
}

export interface WakeSegment extends WaterDrop {
  readonly toX: number
  readonly toZ: number
}

/** Mood levels in 0..1; MoodDriver eases them every frame. */
export interface MoodLevels {
  /** refused: vermilion flash on the reflection (decays) */
  tint: number
  /** ok: sakura gust strength (decays) */
  gust: number
  /** frozen: current mist density, easing towards mistTarget */
  mist: number
  mistTarget: number
  /** Set by ok: the petals respawn a flurry once, then clear it. */
  burst: boolean
}

const MAX_DROPS = 8
const MAX_CENTER_RIPPLES = 4

class SceneBus {
  private drops: WaterDrop[] = []
  private pendingWake: WakeSegment | null = null
  private centerRipples: number[] = []
  private rippled = false
  private readonly rippleListeners = new Set<() => void>()
  private readonly wakeListeners = new Set<() => void>()

  /** Pointer in normalised device coordinates, used for camera parallax. */
  readonly pointer = { x: 0, y: 0 }
  readonly mood: MoodLevels = { tint: 0, gust: 0, mist: 0, mistTarget: 0, burst: false }
  /** performance.now() until which on-demand canvases keep rendering. */
  awakeUntil = 0
  /** Debug (?stats): pins the camera on the hero → gate glide at this progress. */
  pinnedGlide: number | null = null

  pushDrop(drop: WaterDrop): void {
    if (this.drops.length < MAX_DROPS) this.drops.push(drop)
  }

  takeDrops(): WaterDrop[] {
    if (this.drops.length === 0) return this.drops
    const taken = this.drops
    this.drops = []
    return taken
  }

  /** Extends the pending wake so several pointer moves between steps join up. */
  addWake(segment: WakeSegment, maxAmplitude: number): void {
    const pending = this.pendingWake
    if (!pending) {
      this.pendingWake = segment
      return
    }
    const sum = pending.amplitude + segment.amplitude
    const amplitude = Math.sign(sum) * Math.min(Math.abs(sum), maxAmplitude)
    this.pendingWake = { ...segment, x: pending.x, z: pending.z, amplitude }
  }

  takeWake(): WakeSegment | null {
    const segment = this.pendingWake
    this.pendingWake = null
    return segment
  }

  requestCenterRipple(strength: number): void {
    if (this.centerRipples.length < MAX_CENTER_RIPPLES) this.centerRipples.push(Math.min(Math.max(strength, 0.2), 4))
    this.keepAwake(4500)
  }

  takeCenterRipples(): number[] {
    if (this.centerRipples.length === 0) return this.centerRipples
    const taken = this.centerRipples
    this.centerRipples = []
    return taken
  }

  setMood(kind: SceneMood): void {
    const mood = this.mood
    if (kind === 'ok') {
      mood.gust = 1
      mood.burst = true
    } else if (kind === 'refused') {
      mood.tint = 0.8
      this.requestCenterRipple(3)
    } else {
      mood.mistTarget = kind === 'frozen' ? 1 : 0
    }
    this.keepAwake(5000)
  }

  /** Keeps on-demand canvases rendering for at least `ms` more milliseconds. */
  keepAwake(ms: number): void {
    this.awakeUntil = Math.max(this.awakeUntil, performance.now() + ms)
    for (const listener of this.wakeListeners) listener()
  }

  isAwake(): boolean {
    return performance.now() < this.awakeUntil
  }

  onWake(listener: () => void): () => void {
    this.wakeListeners.add(listener)
    return () => {
      this.wakeListeners.delete(listener)
    }
  }

  /** Fires the listeners once, the first time anyone disturbs the water. */
  noteRipple(): void {
    if (this.rippled) return
    this.rippled = true
    for (const listener of this.rippleListeners) listener()
  }

  onFirstRipple(listener: () => void): () => void {
    this.rippleListeners.add(listener)
    return () => {
      this.rippleListeners.delete(listener)
    }
  }
}

export const sceneBus = new SceneBus()

/** useFrame priorities: camera first, then simulation, reflection, composer. */
export const FRAME = {
  camera: -40,
  mood: -35,
  animate: -30,
  simulate: -20,
  reflect: -10,
  composer: 1,
} as const
