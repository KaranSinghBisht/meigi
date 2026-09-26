import { seededRandom } from '../shared/noise'
import { SHORE_TALL, SHORE_WIDE, TALL_ROOM, WIDE_ROOM, drift, fits, heroCamera, inland, type Planter, type ShoreShape } from './shore'

// Planting the bank, Oishi Park style: kochia in short hedges along the water,
// stretches of lavender rows, drifts of cosmos in thick and thin patches, and
// low feathery bedding under everything that hides the stems and the cut
// along the water's edge.

export interface GardenLayout {
  readonly shore: ShoreShape
  /** x, z, radius, height per dome */
  readonly kochia: Float32Array
  /** 0 chartreuse … 1 magenta, per dome */
  readonly kochiaTint: Float32Array
  /** x, z, height, head radius per flower */
  readonly cosmos: Float32Array
  /** tint (0 white … 1 magenta), seed per flower */
  readonly cosmosLook: Float32Array
  /** x, z, height, width per lavender tuft */
  readonly lavender: Float32Array
  /** x, z, height, width per bedding clump */
  readonly foliage: Float32Array
  /** tint (0 moss … 1 lavender-grey), seed per clump */
  readonly foliageShade: Float32Array
}

/** Half-width of the planted bank, and of the part set with cosmos drifts. */
const REACH = 18
const BLOOM = 11

function placeKochia(planter: Planter): { domes: number[]; tints: number[] } {
  const { random } = planter
  const domes: number[] = []
  const tints: number[] = []
  let x = -REACH
  while (x < REACH) {
    // A short hedge of touching domes of one hue, then a gap.
    const count = 3 + Math.floor(random() * 4)
    const hue = 0.15 + random() * 0.85
    for (let i = 0; i < count && x < REACH; i++) {
      const radius = planter.domeMax * (0.7 + random() * 0.3)
      const height = radius * (1.8 + random() * 0.5)
      const at = inland(planter, x, radius + 0.3 + random() * 0.12)
      if (fits(planter, at, height, planter.domeKeepOff)) {
        domes.push(at.x, at.z, radius, height)
        tints.push(Math.min(1, Math.max(0, hue + (random() - 0.5) * 0.25)))
      }
      x += radius * 1.55
    }
    x += 0.5 + random() * 1.2
  }
  return { domes, tints }
}

function placeLavender(planter: Planter): number[] {
  const tufts: number[] = []
  for (const row of [1.65, 2.05, 2.45]) {
    for (let x = -REACH; x <= REACH; x += 0.2 + planter.random() * 0.08) {
      if (drift(x, row, 41) < 0.5) continue
      const height = 0.26 + planter.random() * 0.14
      const at = inland(planter, x, row + (planter.random() - 0.5) * 0.12)
      if (fits(planter, at, height)) tufts.push(at.x, at.z, height, 0.3 + planter.random() * 0.12)
    }
  }
  return tufts
}

function placeCosmos(planter: Planter, tries: number): { flowers: number[]; looks: number[] } {
  const { random } = planter
  const flowers: number[] = []
  const looks: number[] = []
  for (let i = 0; i < tries; i++) {
    const x = (random() * 2 - 1) * BLOOM
    const at = inland(planter, x, 0.3 + Math.pow(random(), 1.3) * 3.6)
    const thick = drift(at.x, at.z, 7)
    if (random() > 0.12 + 0.88 * thick) continue
    const height = 0.24 + (0.2 + 0.25 * thick) * random() + 0.12 * drift(at.x, at.z, 19)
    if (!fits(planter, at, height)) continue
    flowers.push(at.x, at.z, height, 0.034 + random() * 0.02)
    looks.push(Math.pow(random(), 0.6), random())
  }
  return { flowers, looks }
}

function placeFoliage(planter: Planter, tries: number): { clumps: number[]; shades: number[] } {
  const { random } = planter
  const clumps: number[] = []
  const shades: number[] = []
  const add = (x: number, inset: number, scale: number) => {
    const at = inland(planter, x, inset)
    const height = (0.12 + random() * 0.14) * scale
    if (!fits(planter, at, height)) return
    clumps.push(at.x, at.z, height, (0.28 + random() * 0.26) * scale)
    shades.push(drift(at.x, at.z, 29) * 0.8 + random() * 0.2, random())
  }
  // A continuous fringe along the water's edge, then a carpet thinning inland.
  for (let x = -REACH; x <= REACH; x += 0.12 + random() * 0.06) add(x, random() * 0.2, 0.9)
  for (let i = 0; i < tries; i++) add((random() * 2 - 1) * REACH, Math.pow(random(), 1.6) * 6, 1)
  return { clumps, shades }
}

export function gardenLayout(aspect: number): GardenLayout {
  const tall = aspect < 0.8
  const planter: Planter = {
    shore: tall ? SHORE_TALL : SHORE_WIDE,
    camera: heroCamera(aspect),
    headroom: tall ? TALL_ROOM : WIDE_ROOM,
    domeKeepOff: tall ? 2.8 : 7.2,
    domeMax: tall ? 0.24 : 0.34,
    random: seededRandom(20260927),
  }
  const kochia = placeKochia(planter)
  const lavender = placeLavender(planter)
  const cosmos = placeCosmos(planter, 11000)
  const foliage = placeFoliage(planter, 6000)
  return {
    shore: planter.shore,
    kochia: new Float32Array(kochia.domes),
    kochiaTint: new Float32Array(kochia.tints),
    cosmos: new Float32Array(cosmos.flowers),
    cosmosLook: new Float32Array(cosmos.looks),
    lavender: new Float32Array(lavender),
    foliage: new Float32Array(foliage.clumps),
    foliageShade: new Float32Array(foliage.shades),
  }
}
