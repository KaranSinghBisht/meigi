import { Euler, InstancedBufferAttribute, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import { seededRandom } from '../shared/noise'
import { WORLD } from '../shared/world'

const FADE_SECONDS = 2.2
/** Petals re-seed around a new station when the camera moves this far. */
const REANCHOR_DISTANCE = 5

export type LandingHandler = (x: number, z: number) => void

interface Petal {
  x: number
  y: number
  z: number
  windX: number
  windY: number
  windZ: number
  readonly axis: Vector3
  spin: number
  phase: number
  size: number
  floating: boolean
  age: number
  life: number
}

function createPetal(): Petal {
  return {
    x: 0,
    y: 0,
    z: 0,
    windX: 0,
    windY: 0,
    windZ: 0,
    axis: new Vector3(),
    spin: 0,
    phase: 0,
    size: 0,
    floating: false,
    age: 0,
    life: 0,
  }
}

/**
 * CPU state for the drifting petals. Positions are cheap to integrate for a
 * few hundred instances, and the CPU needs to know when each petal touches
 * the water so it can drop a ripple into the simulation.
 */
export class PetalField {
  readonly count: number
  /** Per-instance opacity, bound to the geometry's aFade attribute. */
  readonly fade: Float32Array
  private readonly petals: Petal[]
  private readonly random: () => number
  /** Camera position the petal volume is laid out in front of. */
  private readonly anchor: Vector3
  /** 0..1 wind boost from the 'ok' mood. */
  gust = 0
  private cursor = 0
  private readonly matrix = new Matrix4()
  private readonly quat = new Quaternion()
  private readonly euler = new Euler(0, 0, 0, 'YXZ')
  private readonly position = new Vector3()
  private readonly scale = new Vector3()

  constructor(count: number, seed: number, anchor: Vector3) {
    this.count = count
    this.anchor = anchor.clone()
    this.fade = new Float32Array(count)
    this.random = seededRandom(seed)
    this.petals = Array.from({ length: count }, createPetal)
    this.petals.forEach((petal, i) => this.spawn(petal, i, true))
  }

  private spawn(petal: Petal, i: number, scattered: boolean): void {
    const r = this.random
    const a = this.anchor
    const depth = 4 + 34 * Math.pow(r(), 1.3)
    const halfWidth = 0.56 * depth + 1.2
    petal.x = a.x - halfWidth * 1.3 + r() * halfWidth * 2
    petal.y = a.y - WORLD.eyeHeight + (scattered ? r() * 8.5 : 6.2 + r() * 3)
    petal.z = a.z - depth
    petal.windX = 0.3 + r() * 0.4
    petal.windY = 0.26 + r() * 0.2
    petal.windZ = (r() - 0.5) * 0.12
    petal.axis.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
    petal.spin = 1.1 + r() * 2.4
    petal.phase = r() * Math.PI * 2
    petal.size = 0.045 + r() * 0.03
    petal.floating = false
    petal.age = 0
    petal.life = 5 + r() * 6
    this.fade[i] = 1
  }

  private fall(petal: Petal, i: number, dt: number, time: number, onLand: LandingHandler): void {
    const flutter = Math.sin(time * 1.7 + petal.phase)
    const lift = (0.8 + 0.35 * Math.sin(time * 2.3 + petal.phase * 1.3)) * (1 - 0.45 * this.gust)
    petal.x += (petal.windX * (1 + 4 * this.gust) + flutter * 0.22 * (1 + this.gust)) * dt
    petal.y -= petal.windY * lift * dt
    petal.z += petal.windZ * dt
    const depth = this.anchor.z - petal.z
    if (petal.x - this.anchor.x > 0.56 * depth * 1.4 + 2) {
      this.spawn(petal, i, false)
      return
    }
    if (petal.y > 0) return
    petal.y = 0.004
    petal.floating = true
    onLand(petal.x, petal.z)
  }

  private float(petal: Petal, i: number, dt: number): void {
    petal.age += dt
    petal.x += petal.windX * 0.06 * dt
    const overdue = petal.age - petal.life
    const fade = overdue <= 0 ? 1 : Math.max(0, 1 - overdue / FADE_SECONDS)
    this.fade[i] = fade
    if (fade === 0) this.spawn(petal, i, false)
  }

  /** Re-seeds the whole volume around a new camera position; true if it moved. */
  setAnchor(position: Vector3): boolean {
    if (position.distanceTo(this.anchor) < REANCHOR_DISTANCE) return false
    this.anchor.copy(position)
    this.petals.forEach((petal, i) => this.spawn(petal, i, true))
    return true
  }

  /** Mood 'ok': a flurry close to the camera on the left; the gust carries it across. */
  burst(count: number): void {
    const r = this.random
    const a = this.anchor
    for (let n = 0; n < count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % this.count
      const petal = this.petals[i]
      if (!petal) continue
      this.spawn(petal, i, true)
      const depth = 3 + r() * 9
      const halfWidth = 0.56 * depth + 1.2
      petal.x = a.x - halfWidth * (0.55 + r() * 0.6)
      petal.y = a.y - WORLD.eyeHeight + 0.5 + r() * 3.5
      petal.z = a.z - depth
    }
  }

  update(dt: number, time: number, onLand: LandingHandler): void {
    this.petals.forEach((petal, i) => {
      if (petal.floating) this.float(petal, i, dt)
      else this.fall(petal, i, dt, time, onLand)
    })
  }

  private orient(petal: Petal, time: number): Quaternion {
    if (petal.floating) {
      this.euler.set(-Math.PI / 2, petal.phase, 0)
      return this.quat.setFromEuler(this.euler)
    }
    return this.quat.setFromAxisAngle(petal.axis, petal.phase + time * petal.spin)
  }

  /** Writes instance matrices and fades into the mesh. */
  write(mesh: InstancedMesh, time: number): void {
    this.petals.forEach((petal, i) => {
      this.position.set(petal.x, petal.y, petal.z)
      this.scale.setScalar(petal.size)
      this.matrix.compose(this.position, this.orient(petal, time), this.scale)
      mesh.setMatrixAt(i, this.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    const fade = mesh.geometry.getAttribute('aFade')
    if (fade instanceof InstancedBufferAttribute) fade.needsUpdate = true
  }
}
