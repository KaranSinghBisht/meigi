import { BufferAttribute, BufferGeometry } from 'three'
import { fractalNoise, valueNoise } from '../shared/noise'
import { RIM, fujiProfile } from './fujiProfile'

export interface FujiShape {
  readonly x: number
  readonly z: number
  readonly baseY: number
  readonly height: number
  readonly radius: number
}

const RINGS = 200
const SEGMENTS = 320

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Rim bumps, gentle shoulders and ridged gullies, as a fraction of height. */
function relief(theta: number, s: number): number {
  const rimBand = 1 - smoothstep(RIM * 0.6, RIM * 1.6, s)
  const rim = (valueNoise(theta * 2.6 + 4.0, 1.3) - 0.45) * 0.024 * rimBand

  const slope = smoothstep(RIM, RIM + 0.06, s) * (1 - smoothstep(0.5, 0.95, s))
  const lumps = (fractalNoise(theta * 1.7 + 11.0, s * 3.0, 3) - 0.5) * 0.03 * slope

  const n = valueNoise(theta * 14.0 + s * 1.6, s * 2.4)
  const valley = Math.pow(1 - Math.abs(n * 2 - 1), 3)
  const gullies = -valley * 0.012 * slope

  return rim + lumps + gullies
}

function ringRadius(i: number): number {
  return Math.pow(i / RINGS, 1.5)
}

/** Radial mesh: rings from the summit outwards, θ = 0 facing the camera (+z). */
export function createFujiGeometry(shape: FujiShape): BufferGeometry {
  const stride = SEGMENTS + 1
  const positions = new Float32Array((RINGS + 1) * stride * 3)
  let p = 0
  for (let i = 0; i <= RINGS; i++) {
    const s = ringRadius(i)
    const r = s * shape.radius
    for (let j = 0; j <= SEGMENTS; j++) {
      const theta = -Math.PI + (j / SEGMENTS) * Math.PI * 2
      const h = Math.max(fujiProfile(s) + relief(theta, s), 0)
      positions[p++] = shape.x + r * Math.sin(theta)
      positions[p++] = shape.baseY + h * shape.height
      positions[p++] = shape.z + r * Math.cos(theta)
    }
  }

  const indices = new Uint32Array(RINGS * SEGMENTS * 6)
  let k = 0
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const a = i * stride + j
      const b = a + stride
      indices[k++] = a
      indices[k++] = b
      indices[k++] = a + 1
      indices[k++] = b
      indices[k++] = b + 1
      indices[k++] = a + 1
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}
