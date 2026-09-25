import { CatmullRomCurve3, Vector3 } from 'three'
import type { ToriiPlacement } from '../shared/world'
import { gatePoint } from './stations'

// The enter glide: low over the water, straight through the torii, and on to
// the gate station just beyond it, looking at the mountain.

export function createGlidePath(start: Vector3, torii: ToriiPlacement, end: Vector3): CatmullRomCurve3 {
  const approach = new Vector3().lerpVectors(start, gatePoint(torii, 3, 1.6), 0.5)
  approach.y = 1.15
  return new CatmullRomCurve3(
    [start.clone(), approach, gatePoint(torii, 3.2, 1.9), gatePoint(torii, -4, 2.1), end.clone()],
    false,
    'centripetal',
  )
}

const ahead = new Vector3()

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Where the camera looks at glide progress t: along the path first, then at the final target. */
export function glideLookTarget(path: CatmullRomCurve3, t: number, finalTarget: Vector3, out: Vector3): Vector3 {
  path.getPointAt(Math.min(t + 0.12, 1), ahead)
  return out.lerpVectors(ahead, finalTarget, smoothstep(0.4, 0.95, t))
}
