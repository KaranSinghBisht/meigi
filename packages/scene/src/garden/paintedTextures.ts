import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType } from 'three'
import { valueNoise } from '../shared/noise'

// The bedding's foliage texture, painted procedurally pixel by pixel. The
// channels carry shape data rather than colour, so one texture serves every
// tint: the shader colours it per instance.

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
      const strands = valueNoise((u - lean * 0.5) * 70, v * 7) * 0.6 + valueNoise((u - lean) * 170, v * 18) * 0.4
      const crown = (0.55 + 0.45 * Math.cos((u - 0.5) * Math.PI * 1.6)) * (0.8 + 0.35 * valueNoise(u * 9, 2.3))
      const height = v / Math.max(crown, 0.05)
      const thinning = smooth(0.35, 1.0, height)
      const cover = smooth(0.4 + 0.32 * thinning, 0.47 + 0.32 * thinning, strands) * smooth(1.0, 0.94, height) * smooth(0.0, 0.05, v)
      const i = (y * SIZE + x) * 4
      data[i] = Math.round(Math.min(height, 1) * 255)
      data[i + 1] = Math.round(strands * 255)
      data[i + 2] = 0
      data[i + 3] = Math.round(Math.min(cover, 1) * 255)
    }
  }
  return texture(data)
}
