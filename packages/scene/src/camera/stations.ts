import { Matrix4, Quaternion, Vector3 } from 'three'
import type { Station } from '../types'
import { WORLD, framingFor, toriiPlacement, type ToriiPlacement } from '../shared/world'

export interface StationPose {
  readonly position: Vector3
  readonly quaternion: Quaternion
  /** Point the camera looks at; the glide steers towards it. */
  readonly target: Vector3
  readonly fov: number
}

/** Where Fuji-facing stations look: the mountain's upper body. */
export const FUJI_FOCUS = new Vector3(WORLD.fuji.x, 55, WORLD.fuji.z)

const UP = new Vector3(0, 1, 0)
const lookMatrix = new Matrix4()
const MAX_FOV = 84

/** Camera orientation looking from `position` at `target` (camera -z towards target). */
export function lookQuaternion(position: Vector3, target: Vector3, out = new Quaternion()): Quaternion {
  lookMatrix.lookAt(position, target, UP)
  return out.setFromRotationMatrix(lookMatrix)
}

/** A point `ahead` units in front of the gate (negative = beyond it), height scaled with the gate. */
export function gatePoint(torii: ToriiPlacement, ahead: number, height: number): Vector3 {
  const facing = new Vector3(Math.sin(torii.rotY), 0, Math.cos(torii.rotY))
  return new Vector3(torii.x, height * torii.scale, torii.z).addScaledVector(facing, ahead)
}

function pose(position: Vector3, target: Vector3, fov: number): StationPose {
  return { position, target, fov: Math.min(fov, MAX_FOV), quaternion: lookQuaternion(position, target) }
}

/** A look target straight down -z, tilted up by `pitch` radians. */
function pitched(position: Vector3, pitch: number): Vector3 {
  return new Vector3(position.x, position.y + Math.tan(pitch) * 100, position.z - 100)
}

/**
 * Camera poses. All of them look roughly down -z (within a few degrees), which
 * keeps the lake's ripple simulation aligned with the view.
 */
export function stationPose(station: Station, aspect: number): StationPose {
  const framing = framingFor(aspect)
  const fov = framing.fov
  const torii = toriiPlacement(aspect)
  const eye = new Vector3(0, WORLD.eyeHeight, 0)
  switch (station) {
    case 'hero':
      return pose(eye, pitched(eye, framing.pitch), fov)
    case 'gate':
      return pose(gatePoint(torii, -16, 2.4), FUJI_FOCUS.clone(), fov * 1.1)
    case 'fuji':
      return pose(new Vector3(0, 11, -30), new Vector3(0, 92, -900), fov * 0.8)
    case 'lake':
      return pose(new Vector3(2, 0.75, -6), new Vector3(0, 3, -400), fov * 1.1)
    case 'shore':
      return pose(new Vector3(0, 3.4, 32), new Vector3(0, 18, -900), fov * 1.3)
    case 'torii':
      return pose(new Vector3(torii.x + 1.5, 1.9, torii.z + 11), new Vector3(torii.x - 1, 3.4, torii.z - 60), fov * 1.15)
    case 'sky':
      return pose(eye, pitched(eye, 0.28), fov)
  }
}
