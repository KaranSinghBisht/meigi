import { BufferAttribute, BufferGeometry, Color } from 'three'
import { fractalNoise, valueNoise } from '../shared/noise'

export interface RidgeLayer {
  readonly z: number
  /** Height of the ridge line at its lowest */
  readonly base: number
  /** Extra height from the rolling profile */
  readonly amp: number
  /** Horizontal feature size in world units */
  readonly scale: number
  readonly seed: number
  readonly color: string
  /** Lowers the ridge near x = 0 so Fuji's base stays readable */
  readonly centerDip: number
  /** Tree-canopy bump height */
  readonly canopy: number
}

const SAMPLES = 360

function ridgeHeight(layer: RidgeLayer, x: number, halfWidth: number): number {
  const u = x / layer.scale
  const rolling = fractalNoise(u + layer.seed, layer.seed * 0.37, 4)
  const canopy = valueNoise(x / 2.2 + layer.seed, 5.1) * layer.canopy
  const center = Math.exp(-Math.pow(x / (halfWidth * 0.32), 2))
  const edgeRise = Math.pow(Math.abs(x) / halfWidth, 2) * layer.amp * 0.5
  const h = layer.base + rolling * layer.amp + canopy + edgeRise - center * layer.centerDip
  return Math.max(h, 0.6)
}

/** Vertical curtains whose top edge is the ridge line; one merged mesh. */
export function createFoothillsGeometry(layers: readonly RidgeLayer[]): BufferGeometry {
  const perLayer = (SAMPLES + 1) * 2
  const positions = new Float32Array(layers.length * perLayer * 3)
  const colors = new Float32Array(layers.length * perLayer * 3)
  const tops = new Float32Array(layers.length * perLayer)
  const indices: number[] = []
  const tint = new Color()

  layers.forEach((layer, li) => {
    tint.set(layer.color)
    const halfWidth = Math.abs(layer.z) * 1.05 + 40
    const first = li * perLayer
    for (let i = 0; i <= SAMPLES; i++) {
      const x = -halfWidth + (i / SAMPLES) * halfWidth * 2
      const top = first + i * 2
      const bottom = top + 1
      positions.set([x, ridgeHeight(layer, x, halfWidth), layer.z], top * 3)
      positions.set([x, -3, layer.z], bottom * 3)
      colors.set([tint.r, tint.g, tint.b], top * 3)
      colors.set([tint.r, tint.g, tint.b], bottom * 3)
      tops[top] = 1
      tops[bottom] = 0
      if (i < SAMPLES) indices.push(top, bottom, top + 2, bottom, bottom + 2, top + 2)
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('aTop', new BufferAttribute(tops, 1))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
