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
