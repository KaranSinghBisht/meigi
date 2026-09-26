import { CubicBezierCurve3, CurvePath, LineCurve3, Vector3 } from 'three'
import type { ToriiPlacement } from '../shared/world'
import { sightlinePoint } from './stations'

// A move between the lake side of the torii and the far side goes through its
// opening along the gate's sightline (the line from the gate to Fuji). The
// camera looks along that line too, so it flies straight through the middle
// of the gate instead of sliding past a pillar.

/** The sightline is joined at most this far in front of the gate. */
const JOIN = 2
/**
 * Both handles lie on the sightline (as shares of the distance to the join),
 * so the curve meets it with zero curvature and the bend is spread over the
 * middle of the approach. In the glide on 16:9 the direction of travel turns
 * at most about half a degree per frame, and eases out to nothing over the
 * last ~15 frames before the join instead of stopping dead.
 */
const LEAD = 0.6
const SETTLE = 0.2
/** Height the hero glide skims down to over the water, on long approaches. */
const SKIM = 1.15

/** Distance in front of the torii, along the way it faces (negative = past it). */
function aheadOfGate(torii: ToriiPlacement, point: Vector3): number {
  return (point.x - torii.x) * Math.sin(torii.rotY) + (point.z - torii.z) * Math.cos(torii.rotY)
}

/** From `near` (lake side) onto the sightline at `join`, arriving along it towards `far`. */
function joinCurve(near: Vector3, join: Vector3, far: Vector3, skim: boolean): CubicBezierCurve3 {
  const span = near.distanceTo(join)
  const along = new Vector3().subVectors(far, join).normalize()
  const lead = join.clone().addScaledVector(along, -span * LEAD)
  // Dip over the water only when there is room for it (not for a start right by the gate).
  if (skim) lead.y += (SKIM - lead.y) * Math.min(Math.max((span - 4) / 8, 0), 1)
  const settle = join.clone().addScaledVector(along, -span * SETTLE)
  return new CubicBezierCurve3(near.clone(), lead, settle, join.clone())
}

/**
 * The path for a move that crosses the torii, or null when both ends are on
 * the same side. The lake-side end is joined to the sightline by a curve that
 * meets it tangentially; the rest runs straight along it. `skim` dips low over
 * the water on the lake side (the hero glide and its return).
 */
export function pathThroughGate(torii: ToriiPlacement, from: Vector3, to: Vector3, skim: boolean): CurvePath<Vector3> | null {
  const fromAhead = aheadOfGate(torii, from)
  const toAhead = aheadOfGate(torii, to)
  if ((fromAhead >= 0) === (toAhead >= 0)) return null
  const near = fromAhead >= 0 ? from : to
  const far = fromAhead >= 0 ? to : from
  // Join between the lake-side end and the gate, so the path never doubles back.
  const join = sightlinePoint(torii, -Math.min(JOIN, Math.max(fromAhead, toAhead) / 2), 1.9)
  const onto = joinCurve(near, join, far, skim)
  const path = new CurvePath<Vector3>()
  if (near === from) {
    path.add(onto)
    path.add(new LineCurve3(join, to.clone()))
  } else {
    path.add(new LineCurve3(from.clone(), join))
    path.add(new CubicBezierCurve3(onto.v3.clone(), onto.v2, onto.v1, onto.v0))
  }
  return path
}
