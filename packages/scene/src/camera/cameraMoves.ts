import { LineCurve3, Quaternion, Vector3, type Curve, type CurvePath } from 'three'
import type { ToriiPlacement } from '../shared/world'
import { GLIDE_SECONDS, STATION_SECONDS } from '../timing'
import type { Station } from '../types'
import { pathThroughGate } from './gatePath'
import type { StationPose } from './stations'

/** The camera pose before drift and parallax are layered on. */
export interface BasePose {
  readonly position: Vector3
  readonly quaternion: Quaternion
  fov: number
}

/**
 * A station change in progress, the only thing driving the camera while it
 * runs: the position eases along `path`, the view turns once and the lens
 * eases once.
 */
export interface CameraMove {
  readonly path: Curve<Vector3>
  readonly from: BasePose
  readonly to: StationPose
  readonly duration: number
  /** Eased progress along the path (0..1) at linear time t (0..1) */
  readonly ease: (t: number) => number
  /** Share of the turn done at eased progress e (0..1) */
  readonly turn: (e: number) => number
  elapsed: number
}

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
const evenTurn = (e: number) => e

/**
 * The glide's single turn ends where the path joins the gate's sightline
 * (about 0.7–0.8 of the way, just before the torii), so the view and the
 * direction of travel line up together and nothing turns at the gate.
 */
function glideTurn(path: CurvePath<Vector3>): (e: number) => number {
  const [approach = 0, total = 1] = path.getCurveLengths()
  const joined = approach / total
  return (e) => smoothstep(0, joined, e)
}

/**
 * A move starts from `start`, the pose actually on screen, so its first frame
 * never jumps. hero → gate is the enter glide; any other move across the
 * torii goes through its opening too; the rest are straight eased tweens.
 */
export function startMove(fromStation: Station, toStation: Station, start: BasePose, to: StationPose, torii: ToriiPlacement): CameraMove {
  const from = clonePose(start)
  const skim = fromStation === 'hero' || toStation === 'hero'
  const through = pathThroughGate(torii, start.position, to.position, skim)
  if (through && fromStation === 'hero' && toStation === 'gate') {
    return { path: through, from, to, duration: GLIDE_SECONDS, ease: power2InOut, turn: glideTurn(through), elapsed: 0 }
  }
  const path = through ?? new LineCurve3(start.position.clone(), to.position.clone())
  return { path, from, to, duration: STATION_SECONDS, ease: easeInOutCubic, turn: evenTurn, elapsed: 0 }
}

/**
 * Writes the pose at linear progress t (0..1) without advancing the move.
 * At t = 1 it is the station pose exactly, so nothing corrects on arrival.
 */
export function poseAt(move: CameraMove, t: number, out: BasePose): void {
  const e = move.ease(t)
  move.path.getPointAt(e, out.position)
  const turn = move.turn(e)
  if (turn >= 1) out.quaternion.copy(move.to.quaternion)
  else out.quaternion.slerpQuaternions(move.from.quaternion, move.to.quaternion, turn)
  out.fov = move.from.fov + (move.to.fov - move.from.fov) * e
}

/** Advances a move by dt seconds and writes the base pose; false once it has arrived. */
export function stepMove(move: CameraMove, dt: number, out: BasePose): boolean {
  move.elapsed = Math.min(move.elapsed + dt, move.duration)
  const t = move.elapsed / move.duration
  poseAt(move, t, out)
  return t < 1
}
