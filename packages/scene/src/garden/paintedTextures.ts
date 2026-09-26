import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType } from 'three'
import { hash2, valueNoise } from '../shared/noise'

// Small textures painted procedurally, pixel by pixel, for the garden's
// flowers and foliage. The channels carry shape data rather than colour, so
// one texture serves every tint: the shaders colour them per instance.

const SIZE = 256

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

function texture(data: Uint8Array): DataTexture {
  const map = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType)
  map.generateMipmaps = true
  map.minFilter = LinearMipmapLinearFilter
  map.magFilter = LinearFilter
  map.needsUpdate = true
  return map
}

/** One cosmos petal's coverage at polar (r, offset from its axis); three soft teeth at the tip. */
function petalCover(r: number, offset: number, seed: number): number {
  const length = 0.9 + 0.08 * (hash2(seed, 3) - 0.5)
  const u = r / length
  if (u >= 1.02) return 0
  const width = 0.2 * Math.pow(Math.sin(Math.PI * Math.min(u, 1) * 0.92 + 0.2), 0.7) + 0.02
  const teeth = u > 0.86 ? 0.06 * Math.abs(Math.sin((offset / Math.max(width, 0.01)) * Math.PI * 1.5)) : 0
  const side = smooth(width, width * 0.72, Math.abs(offset))
  return side * smooth(1.0 - teeth, 0.9 - teeth, u)
}

/**
 * Cosmos head, painterly. R: position along the petal (0 heart → 1 tip),
 * G: the golden heart, B: brush streaks along the petals, A: coverage with
 * soft, slightly translucent edges.
 */
export function createCosmosTexture(): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4)
  const petals = 8
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = (x + 0.5) / SIZE * 2 - 1
      const py = (y + 0.5) / SIZE * 2 - 1
      const r = Math.hypot(px, py)
      const angle = Math.atan2(py, px)
      const slot = Math.round((angle / (Math.PI * 2)) * petals)
      const axis = (slot / petals) * Math.PI * 2 + (hash2(slot, 7) - 0.5) * 0.12
      const offset = Math.sin(angle - axis) * r
      const cover = petalCover(r, offset, slot)
      const heart = smooth(0.2, 0.14, r)
      const streak = 0.5 + 0.5 * Math.sin(offset * 90 + valueNoise(r * 9, slot * 3.1) * 4)
      const i = (y * SIZE + x) * 4
      data[i] = Math.round(smooth(0.12, 0.92, r) * 255)
      data[i + 1] = Math.round(heart * (0.75 + 0.25 * valueNoise(px * 40, py * 40)) * 255)
      data[i + 2] = Math.round((0.35 + 0.65 * streak * valueNoise(r * 14, angle * 6)) * 255)
      data[i + 3] = Math.round(Math.max(cover * (0.88 + 0.12 * (1 - r)), heart) * 255)
    }
  }
  return texture(data)
}

/**
 * A clump of fine, feathery foliage (cosmos leaves, low bedding): thin
 * slanted strands, dense at the foot and fraying into single threads at the
 * top. R: height in the clump (0 foot → 1 top), G: strand light, A: coverage.
 */
export function createFoliageTexture(): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5) / SIZE
      const v = 1 - (y + 0.5) / SIZE
      const lean = (u - 0.5) * v * 1.6
      const strands = valueNoise((u - lean * 0.5) * 46, v * 6) * 0.65 + valueNoise((u - lean) * 120, v * 14) * 0.35
      const crown = (0.55 + 0.45 * Math.cos((u - 0.5) * Math.PI * 1.6)) * (0.8 + 0.35 * valueNoise(u * 9, 2.3))
      const height = v / Math.max(crown, 0.05)
      const thinning = smooth(0.35, 1.0, height)
      const cover = smooth(0.42 + 0.3 * thinning, 0.56 + 0.3 * thinning, strands) * smooth(1.02, 0.85, height) * smooth(0.0, 0.08, v)
      const i = (y * SIZE + x) * 4
      data[i] = Math.round(Math.min(height, 1) * 255)
      data[i + 1] = Math.round(strands * 255)
      data[i + 2] = 0
      data[i + 3] = Math.round(Math.min(cover, 1) * 255)
    }
  }
  return texture(data)
}
