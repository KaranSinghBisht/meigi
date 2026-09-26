import { Quaternion, Vector3, type CatmullRomCurve3 } from 'three'
import type { ToriiPlacement } from '../shared/world'
import { GLIDE_SECONDS, STATION_SECONDS } from '../timing'
import type { Station } from '../types'
import { createGlidePath } from './glidePath'
import { gatePoint, lookQuaternion, type StationPose } from './stations'

/** The camera pose before drift and parallax are layered on. */
export interface BasePose {
  readonly position: Vector3
  readonly quaternion: Quaternion
  fov: number
}

interface TweenMove {
  readonly kind: 'tween'
  readonly from: BasePose
  readonly to: StationPose
  readonly duration: number
  elapsed: number
}

interface GlideMove {
  readonly kind: 'glide'
  readonly path: CatmullRomCurve3
  /** Where the camera was facing when the glide began. */
  readonly restDir: Vector3
  /** A point well beyond the gate on its axis: the camera looks through the torii at it. */
  readonly gateFocus: Vector3
  readonly from: BasePose
  readonly to: StationPose
  readonly duration: number
  elapsed: number
}

export type CameraMove = TweenMove | GlideMove

export function createBasePose(): BasePose {
  return { position: new Vector3(), quaternion: new Quaternion(), fov: 34 }
}

export function copyPose(from: StationPose | BasePose, into: BasePose): void {
  into.position.copy(from.position)
  into.quaternion.copy(from.quaternion)
  into.fov = from.fov
}

function clonePose(pose: BasePose): BasePose {
  return { position: pose.position.clone(), quaternion: pose.quaternion.clone(), fov: pose.fov }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const power2InOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** hero → gate flies through the torii; every other change is an eased tween. */
export function startMove(fromStation: Station, toStation: Station, base: BasePose, to: StationPose, torii: ToriiPlacement): CameraMove {
  const from = clonePose(base)
  if (fromStation === 'hero' && toStation === 'gate') {
    const restDir = new Vector3(0, 0, -1).applyQuaternion(base.quaternion)
    const path = createGlidePath(base.position, torii, to.position)
    const gateFocus = gatePoint(torii, -45, 2.6)
    return { kind: 'glide', path, restDir, gateFocus, from, to, duration: GLIDE_SECONDS, elapsed: 0 }
  }
  return { kind: 'tween', from, to, duration: STATION_SECONDS, elapsed: 0 }
}

const gateDir = new Vector3()
const endDir = new Vector3()
const lookDir = new Vector3()
const lookPoint = new Vector3()

/**
 * Blends view directions, not look-at points: from where the camera faced,
 * to straight through the torii, to the mountain. Blending points at very
 * different distances made the nearer one grab the view and whip the camera.
 */
function glidePose(move: GlideMove, t: number, out: BasePose): void {
  const e = power2InOut(t)
  move.path.getPointAt(e, out.position)
  gateDir.subVectors(move.gateFocus, out.position).normalize()
  endDir.subVectors(move.to.target, out.position).normalize()
  lookDir.copy(move.restDir).lerp(gateDir, smoothstep(0.04, 0.45, e)).normalize()
  lookDir.lerp(endDir, smoothstep(0.55, 0.97, e)).normalize()
  lookQuaternion(out.position, lookPoint.copy(out.position).add(lookDir), out.quaternion)
  out.fov = move.from.fov + (move.to.fov - move.from.fov) * e + 4 * Math.sin(Math.PI * e)
}

function tweenPose(move: TweenMove, t: number, out: BasePose): void {
  const e = easeInOutCubic(t)
  out.position.lerpVectors(move.from.position, move.to.position, e)
  out.quaternion.slerpQuaternions(move.from.quaternion, move.to.quaternion, e)
  out.fov = move.from.fov + (move.to.fov - move.from.fov) * e
}

/** Writes the pose at absolute progress t (0..1) without advancing the move. */
export function poseAt(move: CameraMove, t: number, out: BasePose): void {
  if (move.kind === 'glide') glidePose(move, t, out)
  else tweenPose(move, t, out)
}

/** Advances a move by dt seconds and writes the base pose; false once it has arrived. */
export function stepMove(move: CameraMove, dt: number, out: BasePose): boolean {
  move.elapsed = Math.min(move.elapsed + dt, move.duration)
  const t = move.elapsed / move.duration
  poseAt(move, t, out)
  return t < 1
}
