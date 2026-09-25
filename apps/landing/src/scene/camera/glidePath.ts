import { CatmullRomCurve3, Vector3 } from 'three'
import { WORLD, type ToriiPlacement } from '../shared/world'

// The enter glide: low over the water, straight through the torii, then a
// gentle rise and turn towards the mountain.

/** A point `ahead` units in front of the gate (negative = beyond it), height scaled with the gate. */
function gatePoint(torii: ToriiPlacement, ahead: number, height: number): Vector3 {
  const facing = new Vector3(Math.sin(torii.rotY), 0, Math.cos(torii.rotY))
  return new Vector3(torii.x, height * torii.scale, torii.z).addScaledVector(facing, ahead)
}

export function createGlidePath(start: Vector3, torii: ToriiPlacement): CatmullRomCurve3 {
  const approach = new Vector3().lerpVectors(start, gatePoint(torii, 3, 1.6), 0.5)
  approach.y = 1.15
  return new CatmullRomCurve3(
    [
      start.clone(),
      approach,
      gatePoint(torii, 3.2, 1.9),
      gatePoint(torii, -4, 2.1),
      new Vector3(torii.x + 2, 3.4, torii.z - 38),
      new Vector3(torii.x + 7, 6.5, torii.z - 105),
    ],
    false,
    'centripetal',
  )
}

const FUJI_FOCUS = new Vector3(WORLD.fuji.x, 55, WORLD.fuji.z)
const ahead = new Vector3()

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Where the camera looks at glide progress t: the gate first, then Fuji. */
export function glideLookTarget(path: CatmullRomCurve3, t: number, target: Vector3): Vector3 {
  path.getPointAt(Math.min(t + 0.12, 1), ahead)
  const towardFuji = smoothstep(0.3, 0.85, t)
  return target.lerpVectors(ahead, FUJI_FOCUS, towardFuji * 0.85)
}
