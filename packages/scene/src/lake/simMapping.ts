import { Vector3, Vector4, type Quaternion } from 'three'

// The ripple texture is laid over the water in a perspective-shaped space:
//   u = 0.5 + x / (depth · xSpan)     (angle across the view)
//   w = (1/depth − 1/far) / (1/near − 1/far)   (inverse depth, 1 = nearest)
// so texels are roughly even on screen from the bottom edge to the horizon.
// The wave equation compensates with a per-row speed so rings stay circular
// in world space and foreshorten naturally.

export interface SimMapping {
  readonly xSpan: number
  readonly invNear: number
  readonly invFar: number
  readonly originX: number
  readonly originZ: number
}

const FAR_DEPTH = 430
const DEG = Math.PI / 180

/** The camera the sim is laid out for: a station's resting pose. */
export interface MappingView {
  /** Vertical field of view, degrees */
  readonly fov: number
  /** Upward pitch, radians */
  readonly pitch: number
  /** Height above the water */
  readonly height: number
  readonly x: number
  readonly z: number
}

const forward = new Vector3()

/** Mapping view for a pose that looks roughly down -z. */
export function mappingView(position: Vector3, quaternion: Quaternion, fov: number): MappingView {
  forward.set(0, 0, -1).applyQuaternion(quaternion)
  const pitch = Math.asin(Math.min(Math.max(forward.y, -1), 1))
  return { fov, pitch, height: position.y, x: position.x, z: position.z }
}

export function createSimMapping(view: MappingView, aspect: number): SimMapping {
  const halfV = (view.fov * DEG) / 2
  const tanHalfH = Math.tan(halfV) * aspect
  const xMax = tanHalfH * 1.12 + 0.08
  const bottomElevation = Math.max(halfV - view.pitch, 2 * DEG)
  const nearDepth = (Math.max(view.height, 0.2) / Math.tan(bottomElevation)) * 0.78
  return {
    xSpan: 2 * xMax,
    invNear: 1 / nearDepth,
    invFar: 1 / FAR_DEPTH,
    originX: view.x,
    originZ: view.z,
  }
}

/** Packs the mapping for shaders: (xSpan, invNear, invFar, unused). */
export function mappingUniform(mapping: SimMapping, target = new Vector4()): Vector4 {
  return target.set(mapping.xSpan, mapping.invNear, mapping.invFar, 0)
}

export function depthOf(mapping: SimMapping, z: number): number {
  return mapping.originZ - z
}

/** Returns sim-space coordinates, or null when the point is off the texture. */
export function worldToSim(mapping: SimMapping, x: number, z: number): { u: number; w: number } | null {
  const depth = depthOf(mapping, z)
  if (depth <= 0) return null
  const u = 0.5 + (x - mapping.originX) / (depth * mapping.xSpan)
  const w = (1 / depth - mapping.invFar) / (mapping.invNear - mapping.invFar)
  if (u < 0 || u > 1 || w < 0 || w > 1) return null
  return { u, w }
}

/** World radius that spans `texels` columns of the sim texture at depth z. */
export function texelRadius(mapping: SimMapping, z: number, texels: number, size: number): number {
  return (depthOf(mapping, z) * mapping.xSpan * texels) / size
}
