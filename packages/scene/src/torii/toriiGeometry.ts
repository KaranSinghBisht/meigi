import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { HEX } from '../shared/palette'

// Myōjin-style torii, modelled around Hakone's lakeside gate. Units: world
// units with the waterline at y = 0; the kasagi tips sit about 6.3 up.

const SPAN = 2.2 // half the distance between the pillars
const LEAN = 0.035 // inward lean (転び) in radians
const PILLAR_BOTTOM = -1.2
const PILLAR_TOP = 5.45

interface Beam {
  readonly width: number
  readonly height: number
  readonly depth: number
  readonly y: number
  /** Upturn at the tips (反り) */
  readonly sori: number
  readonly color: string
}

const NUKI: Beam = { width: 6.1, height: 0.4, depth: 0.24, y: 4.35, sori: 0, color: HEX.vermilion }
const SHIMAKI: Beam = { width: 6.5, height: 0.34, depth: 0.36, y: 5.52, sori: 0.07, color: HEX.vermilion }
const KASAGI: Beam = { width: 7.7, height: 0.4, depth: 0.5, y: 5.86, sori: 0.36, color: HEX.lacquerBlack }

function paint(geometry: BufferGeometry, hex: string): BufferGeometry {
  const tint = new Color(hex)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) colors.set([tint.r, tint.g, tint.b], i * 3)
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

/** A beam whose ends curve upwards; the curve grows faster towards the tips. */
function beam(spec: Beam): BufferGeometry {
  const geometry = new BoxGeometry(spec.width, spec.height, spec.depth, 32, 1, 1)
  const position = geometry.getAttribute('position')
  const half = spec.width / 2
  for (let i = 0; i < position.count; i++) {
    const t = Math.abs(position.getX(i)) / half
    const lift = spec.sori * Math.pow(t, 2.6)
    // The upper face flares slightly wider at the tips, like a real kasagi.
    const flare = position.getY(i) > 0 ? 1 + 0.03 * t : 1
    position.setXYZ(i, position.getX(i) * flare, position.getY(i) + spec.y + lift, position.getZ(i))
  }
  geometry.computeVertexNormals()
  return paint(geometry, spec.color)
}

function pillar(side: -1 | 1): BufferGeometry {
  const height = PILLAR_TOP - PILLAR_BOTTOM
  const geometry = new CylinderGeometry(0.24, 0.29, height, 24, 1)
  geometry.translate(0, height / 2 + PILLAR_BOTTOM, 0)
  // Pivot at the waterline; the tops tilt towards the centre line.
  geometry.rotateZ(side * LEAN)
  geometry.translate(side * SPAN, 0, 0)
  return paint(geometry, HEX.vermilion)
}

/** Black lacquer sleeve where the pillar meets the water (根巻). */
function nemaki(side: -1 | 1): BufferGeometry {
  const geometry = new CylinderGeometry(0.32, 0.33, 1.6, 24, 1)
  geometry.translate(side * (SPAN - 0.02), -0.45, 0)
  return paint(geometry, HEX.lacquerBlack)
}

function gakuzuka(): BufferGeometry[] {
  const strut = new BoxGeometry(0.26, 0.86, 0.18)
  strut.translate(0, (NUKI.y + SHIMAKI.y) / 2, 0)
  const plaque = new BoxGeometry(0.44, 0.56, 0.06)
  plaque.translate(0, (NUKI.y + SHIMAKI.y) / 2, 0.13)
  return [paint(strut, HEX.vermilion), paint(plaque, '#3A2A2C')]
}

export function createToriiGeometry(): BufferGeometry {
  const parts = [
    pillar(-1),
    pillar(1),
    nemaki(-1),
    nemaki(1),
    beam(NUKI),
    ...gakuzuka(),
    beam(SHIMAKI),
    beam(KASAGI),
  ]
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('Torii parts could not be merged')
  merged.computeBoundingSphere()
  return merged
}
