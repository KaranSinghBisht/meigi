// Mutable, render-rate state shared between the DOM overlay and the scene.
// Kept outside React so pointer moves and the enter glide never re-render.

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

const MAX_DROPS = 8

class SceneBus {
  private drops: WaterDrop[] = []
  private wake: WakeSegment | null = null
  private rippled = false
  private readonly rippleListeners = new Set<() => void>()

  /** 0 → 1 while the enter glide runs; the camera rig reads it every frame. */
  glideProgress = 0
  glideActive = false

  /** Pointer in normalised device coordinates, used for camera parallax. */
  readonly pointer = { x: 0, y: 0 }

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
    const pending = this.wake
    if (!pending) {
      this.wake = segment
      return
    }
    const sum = pending.amplitude + segment.amplitude
    const amplitude = Math.sign(sum) * Math.min(Math.abs(sum), maxAmplitude)
    this.wake = { ...segment, x: pending.x, z: pending.z, amplitude }
  }

  takeWake(): WakeSegment | null {
    const segment = this.wake
    this.wake = null
    return segment
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
  animate: -30,
  simulate: -20,
  reflect: -10,
  composer: 1,
} as const
