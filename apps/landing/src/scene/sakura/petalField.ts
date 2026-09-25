import { Euler, InstancedBufferAttribute, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import { seededRandom } from '../shared/noise'

const FALLING = 0
const FLOATING = 1
const FADE_SECONDS = 2.2

export type LandingHandler = (x: number, z: number) => void

/**
 * CPU state for the drifting petals. Positions are cheap to integrate for a
 * few hundred instances, and the CPU needs to know when each petal touches
 * the water so it can drop a ripple into the simulation.
 */
export class PetalField {
  readonly count: number
  /** Per-instance opacity, bound to the geometry's aFade attribute. */
  readonly fade: Float32Array
  private readonly pos: Float32Array
  private readonly wind: Float32Array
  private readonly axis: Float32Array
  private readonly spin: Float32Array
  private readonly phase: Float32Array
  private readonly size: Float32Array
  private readonly state: Uint8Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly random: () => number
  private readonly matrix = new Matrix4()
  private readonly quat = new Quaternion()
  private readonly euler = new Euler(0, 0, 0, 'YXZ')
  private readonly vec = new Vector3()
  private readonly position = new Vector3()
  private readonly scale = new Vector3()

  constructor(count: number, seed: number) {
    this.count = count
    this.fade = new Float32Array(count)
    this.pos = new Float32Array(count * 3)
    this.wind = new Float32Array(count * 3)
    this.axis = new Float32Array(count * 3)
    this.spin = new Float32Array(count)
    this.phase = new Float32Array(count)
    this.size = new Float32Array(count)
    this.state = new Uint8Array(count)
    this.age = new Float32Array(count)
    this.life = new Float32Array(count)
    this.random = seededRandom(seed)
    for (let i = 0; i < count; i++) this.spawn(i, true)
  }

  private spawn(i: number, scattered: boolean): void {
    const r = this.random
    const depth = 4 + 34 * Math.pow(r(), 1.3)
    const halfWidth = 0.56 * depth + 1.2
    this.pos.set([-halfWidth * 1.3 + r() * halfWidth * 2, scattered ? r() * 8.5 : 6.2 + r() * 3, -depth], i * 3)
    this.wind.set([0.3 + r() * 0.4, 0.26 + r() * 0.2, (r() - 0.5) * 0.12], i * 3)
    this.vec.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
    this.axis.set([this.vec.x, this.vec.y, this.vec.z], i * 3)
    this.spin[i] = 1.1 + r() * 2.4
    this.phase[i] = r() * Math.PI * 2
    this.size[i] = 0.045 + r() * 0.03
    this.state[i] = FALLING
    this.age[i] = 0
    this.life[i] = 5 + r() * 6
    this.fade[i] = 1
  }

  private fall(i: number, dt: number, time: number, onLand: LandingHandler): void {
    const p = i * 3
    const phase = this.phase[i]
    const flutter = Math.sin(time * 1.7 + phase)
    const lift = 0.8 + 0.35 * Math.sin(time * 2.3 + phase * 1.3)
    this.pos[p] += (this.wind[p] + flutter * 0.22) * dt
    this.pos[p + 1] -= this.wind[p + 1] * lift * dt
    this.pos[p + 2] += this.wind[p + 2] * dt
    const depth = -this.pos[p + 2]
    if (this.pos[p] > 0.56 * depth * 1.4 + 2) {
      this.spawn(i, false)
      return
    }
    if (this.pos[p + 1] > 0) return
    this.pos[p + 1] = 0.004
    this.state[i] = FLOATING
    onLand(this.pos[p], this.pos[p + 2])
  }

  private float(i: number, dt: number): void {
    this.age[i] += dt
    this.pos[i * 3] += this.wind[i * 3] * 0.06 * dt
    const overdue = this.age[i] - this.life[i]
    this.fade[i] = overdue <= 0 ? 1 : Math.max(0, 1 - overdue / FADE_SECONDS)
    if (this.fade[i] === 0) this.spawn(i, false)
  }

  update(dt: number, time: number, onLand: LandingHandler): void {
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === FALLING) this.fall(i, dt, time, onLand)
      else this.float(i, dt)
    }
  }

  private orient(i: number, time: number): Quaternion {
    if (this.state[i] === FLOATING) {
      this.euler.set(-Math.PI / 2, this.phase[i], 0)
      return this.quat.setFromEuler(this.euler)
    }
    const a = i * 3
    this.vec.set(this.axis[a], this.axis[a + 1], this.axis[a + 2])
    return this.quat.setFromAxisAngle(this.vec, this.phase[i] + time * this.spin[i])
  }

  /** Writes instance matrices and fades into the mesh. */
  write(mesh: InstancedMesh, time: number): void {
    for (let i = 0; i < this.count; i++) {
      const p = i * 3
      this.position.set(this.pos[p], this.pos[p + 1], this.pos[p + 2])
      this.scale.setScalar(this.size[i])
      this.matrix.compose(this.position, this.orient(i, time), this.scale)
      mesh.setMatrixAt(i, this.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    const fade = mesh.geometry.getAttribute('aFade')
    if (fade instanceof InstancedBufferAttribute) fade.needsUpdate = true
  }
}
