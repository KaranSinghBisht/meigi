import { Vector3 } from 'three'
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
  /** tint (0 white … 1 deep crimson), seed, visible stem length per flower */
  readonly cosmosLook: Float32Array
  /** The nearest row, drawn out of focus: same layout as cosmos */
  readonly bokeh: Float32Array
  readonly bokehLook: Float32Array
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

/** A dome whose centre falls at the hero view's side edge shows as a ball cut in half: leave it out. */
function cutBySide(planter: Planter, at: Vector3, height: number): boolean {
  const ndc = new Vector3(at.x, height / 2, at.z).project(planter.camera)
  return ndc.z < 1 && ndc.y > -1.2 && Math.abs(ndc.x) > planter.domeSide && Math.abs(ndc.x) < 1.4
}

function placeKochia(planter: Planter): { domes: number[]; tints: number[] } {
  const { random } = planter
  const domes: number[] = []
  const tints: number[] = []
  // Phones only ever see the middle of the bank: keep the domes (and their reflection) there.
  const reach = planter.compact ? 9 : REACH
  let x = -reach
  while (x < reach) {
    // Small groups of rounded shrubs, spaced enough to show their silhouettes.
    const count = 3 + Math.floor(random() * 3)
    const hue = 0.12 + random() * 0.65
    for (let i = 0; i < count && x < reach; i++) {
      const radius = planter.domeMax * (0.7 + random() * 0.3)
      const height = radius * (1.8 + random() * 0.5)
      const at = inland(planter, x, radius + 0.3 + random() * 0.12)
      if (fits(planter, at, height, planter.domeKeepOff) && !cutBySide(planter, at, height)) {
        domes.push(at.x, at.z, radius, height)
        tints.push(Math.min(1, Math.max(0, hue + (random() - 0.5) * 0.25)))
      }
      x += radius * 2.1
    }
    x += 0.5 + random() * 1.2
  }
  return { domes, tints }
}

function placeLavender(planter: Planter): number[] {
  const tufts: number[] = []
  for (const row of [0.85, 1.15, 1.45, 1.75, 2.05]) {
    for (let x = -REACH; x <= REACH; x += 0.2 + planter.random() * 0.08) {
      if (drift(x, row, 41) < 0.36) continue
      const height = 0.34 + planter.random() * 0.2
      const at = inland(planter, x, row + (planter.random() - 0.5) * 0.12)
      if (fits(planter, at, height)) tufts.push(at.x, at.z, height, 0.3 + planter.random() * 0.12)
    }
  }
  return tufts
}

interface Blooms {
  readonly flowers: number[]
  readonly looks: number[]
  readonly bokeh: number[]
  readonly bokehLook: number[]
}

/**
 * Now and then a small, sharp blush head beside a soft front-row one: detail
 * between the phone's pills. `blush` is its own sequence, so these extra heads
 * leave the rest of the planting exactly as it was.
 */
function addBlush(planter: Planter, blooms: Blooms, near: Vector3, radius: number, blush: () => number): void {
  if (blush() > 0.45) return
  const at = new Vector3(near.x + (blush() - 0.5) * 0.14, 0, near.z + (blush() - 0.5) * 0.14)
  const lift = 0.14 + blush() * 0.22
  if (!fits(planter, at, lift + radius * 0.5)) return
  blooms.flowers.push(at.x, at.z, lift, radius * 0.5)
  blooms.looks.push(0.3 + blush() * 0.16, blush(), 0)
}

/**
 * Cosmos heads in drifts, floating just over the bedding. Heads shrink
 * towards the hero camera (so the front ones never loom); the nearest row
 * goes to the out-of-focus layer, and only the front edge shows short stems.
 */
function placeCosmos(planter: Planter, tries: number): Blooms {
  const { random, camera, nearRow } = planter
  const blooms: Blooms = { flowers: [], looks: [], bokeh: [], bokehLook: [] }
  const blush = seededRandom(20260929)
  for (let i = 0; i < tries; i++) {
    const at = inland(planter, (random() * 2 - 1) * BLOOM, 0.16 + Math.pow(random(), planter.bedFalloff) * 3.7)
    const patch = drift(at.x, at.z, 7)
    // Leave breathing room between drifts and keep the lavender beds distinct.
    if (patch < 0.3 || random() > patch * patch) continue
    const away = Math.hypot(at.x - camera.position.x, at.z - camera.position.z)
    const height = 0.3 + 0.3 * random() + 0.12 * drift(at.x, at.z, 19)
    const out = away < nearRow
    // The out-of-focus front row: sparse soft heads scattered down through the near bedding.
    const lift = out ? 0.12 + 0.26 * random() : height
    const radius = (0.032 + random() * 0.023) * Math.min(Math.max(away / (nearRow * 1.35), 0.5), 1) * (out ? 1.4 : 1)
    if ((out && random() > planter.frontRow) || !fits(planter, at, lift + radius)) continue
    if (out && planter.compact) addBlush(planter, blooms, at, radius, blush)
    const stem = !out && away < nearRow + 1.3 ? 0.12 + random() * 0.15 : 0
    const tint = Math.min(1, Math.max(0, drift(at.x, at.z, 53) * 0.85 + (random() - 0.5) * 0.24))
    const look = [tint, random(), stem]
    if (out) {
      blooms.bokeh.push(at.x, at.z, lift, radius)
      blooms.bokehLook.push(...look)
    } else {
      blooms.flowers.push(at.x, at.z, height, radius)
      blooms.looks.push(...look)
    }
  }
  return blooms
}

function placeFoliage(planter: Planter, tries: number): { clumps: number[]; shades: number[] } {
  const { random } = planter
  const clumps: number[] = []
  const shades: number[] = []
  const add = (x: number, inset: number, scale: number, shade: number) => {
    const at = inland(planter, x, inset)
    const height = (0.14 + random() * 0.15) * scale
    if (!fits(planter, at, height)) return
    clumps.push(at.x, at.z, height, (0.3 + random() * 0.26) * scale * (planter.compact ? 0.8 : 1))
    shades.push(shade < 0 ? drift(at.x, at.z, 29) * 0.8 + random() * 0.2 : shade, random())
  }
  // A low green fringe softens the stone edge, then bedding thins inland.
  for (let x = -REACH; x <= REACH; x += 0.07 + random() * 0.08) add(x, 0.08 + random() * 0.3, 0.6 + random() * 0.8, 0.3 + random() * 0.3)
  for (let i = 0; i < tries; i++) add((random() * 2 - 1) * REACH, 0.3 + Math.pow(random(), 1.6) * 6, 1, -1)
  return { clumps, shades }
}

export function gardenLayout(aspect: number, compact: boolean): GardenLayout {
  const tall = aspect < 0.8
  const planter: Planter = {
    shore: tall ? SHORE_TALL : SHORE_WIDE,
    camera: heroCamera(aspect),
    headroom: tall ? TALL_ROOM : WIDE_ROOM,
    domeKeepOff: tall ? 2.8 : 8.2,
    domeSide: tall ? 0.8 : 1.4,
    nearRow: tall ? 3.3 : 7.4,
    frontRow: tall ? 0.6 : 0.22,
    // Tall screens see only a narrow strip of bank: crowd the flowers towards the water there.
    bedFalloff: tall ? 2.6 : 0.85,
    compact,
    domeMax: tall ? 0.28 : 0.48,
    random: seededRandom(20260927),
  }
  const kochia = placeKochia(planter)
  const lavender = placeLavender(planter)
  const cosmos = placeCosmos(planter, 22000)
  const foliage = placeFoliage(planter, planter.compact ? 4000 : 7000)
  return {
    shore: planter.shore,
    kochia: new Float32Array(kochia.domes),
    kochiaTint: new Float32Array(kochia.tints),
    cosmos: new Float32Array(cosmos.flowers),
    cosmosLook: new Float32Array(cosmos.looks),
    bokeh: new Float32Array(cosmos.bokeh),
    bokehLook: new Float32Array(cosmos.bokehLook),
    lavender: new Float32Array(lavender),
    foliage: new Float32Array(foliage.clumps),
    foliageShade: new Float32Array(foliage.shades),
  }
}
