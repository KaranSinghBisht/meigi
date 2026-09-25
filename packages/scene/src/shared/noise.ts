// Deterministic CPU noise for building geometry (the GLSL twin lives in glsl.ts).

export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function fade(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  const top = a + (b - a) * fx
  const bottom = c + (d - c) * fx
  return top + (bottom - top) * fy
}

/** Fractal value noise in roughly [0, 1]. */
export function fractalNoise(x: number, y: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let px = x
  let py = y
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(px, py)
    norm += amp
    px = px * 2.03 + 17.1
    py = py * 2.03 + 9.2
    amp *= 0.5
  }
  return sum / norm
}

/** Small seeded PRNG (mulberry32) for placing petals and blossoms. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
