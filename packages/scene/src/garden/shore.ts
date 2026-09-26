import { PerspectiveCamera, Vector3 } from 'three'
import { stationPose } from '../camera/stations'
import { fractalNoise } from '../shared/noise'

// The near shore the Oishi Park beds grow on: the water's edge curves into a
// small cove in front of the hero view, so Fuji's mirrored summit stays open
// water. Plants are thinned against the hero screen so they frame its lower
// corners (wide) or its bottom band (tall) and keep off the wordmark, the
// tagline and the enter button.

/** The water's edge: land lies at z greater than shoreZ(x). */
export interface ShoreShape {
  /** z of the edge at the head of the cove */
  readonly head: number
  /** z of the edge along the rest of the lake */
  readonly side: number
  /** Half-width of the cove's head */
  readonly coveHalf: number
  /** |x| where the edge has turned to run along the lake */
  readonly bend: number
}

// Tall screens put the tagline and the enter button low, over the water: the
// cove comes closer there, so the beds make a thin band along the bottom.
export const SHORE_WIDE: ShoreShape = { head: -5.4, side: -13.5, coveHalf: 0.8, bend: 5 }
export const SHORE_TALL: ShoreShape = { head: -2.95, side: -13.5, coveHalf: 0.45, bend: 5.5 }

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** z of the water's edge at lateral position x; mirrored in the ground shader. */
export function shoreZ(shore: ShoreShape, x: number): number {
  return shore.head + (shore.side - shore.head) * smoothstep(shore.coveHalf, shore.bend, Math.abs(x))
}

/** The hero camera for this viewport, which the plants are thinned against. */
export function heroCamera(aspect: number): PerspectiveCamera {
  const pose = stationPose('hero', aspect)
  const camera = new PerspectiveCamera(pose.fov, aspect, 0.1, 100)
  camera.position.copy(pose.position)
  camera.quaternion.copy(pose.quaternion)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

/** Highest a plant may reach on the hero screen (NDC y) at NDC x. */
export type Headroom = (x: number) => number
export const WIDE_ROOM: Headroom = (x) => (Math.abs(x) < 0.42 ? -1.05 : -0.44)
export const TALL_ROOM: Headroom = (x) => (Math.abs(x) < 0.6 ? -0.66 : -0.56)

export interface Planter {
  readonly shore: ShoreShape
  readonly camera: PerspectiveCamera
  readonly headroom: Headroom
  /** Kochia keep at least this far from the hero camera, so none looms in a corner */
  readonly domeKeepOff: number
  /** Largest kochia radius */
  readonly domeMax: number
  readonly random: () => number
}

/** A point on the land side of the edge: `inset` units from it, square to the edge. */
export function inland(planter: Planter, x: number, inset: number): Vector3 {
  const { shore } = planter
  const slope = (shoreZ(shore, x + 0.01) - shoreZ(shore, x - 0.01)) / 0.02
  const norm = Math.hypot(slope, 1)
  return new Vector3(x - (slope / norm) * inset, 0, shoreZ(shore, x) + inset / norm)
}

/**
 * False when a plant with this top would rise into the hero view's clear
 * zones, or (for big plants, `keepOff` > 0) stand so close to the hero camera
 * that it fills the frame.
 */
export function fits(planter: Planter, at: Vector3, top: number, keepOff = 0): boolean {
  const { camera } = planter
  const ndc = new Vector3(at.x, top, at.z).project(camera)
  if (ndc.z > 1 || Math.abs(ndc.x) > 1.25 || ndc.y < -1.2) return true
  const near = Math.hypot(at.x - camera.position.x, at.z - camera.position.z) < keepOff
  return !near && ndc.y < planter.headroom(ndc.x)
}

/** Where the drifts are thick (1) or thin (0): broad, soft patches along the bank. */
export function drift(x: number, z: number, seed: number): number {
  return smoothstep(0.32, 0.68, fractalNoise(x * 0.33 + seed, z * 0.33 + seed * 0.7, 3))
}
