import {
  Color,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'
import { HEX } from '../shared/palette'

const MAX_WIDTH = 1024
const CLIP_BIAS = 0.003

// Maps clip space [-1, 1] to texture space [0, 1].
const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)

/**
 * Planar reflection for the water plane y = 0. Renders the scene from the
 * camera mirrored below the surface, with an oblique near plane so nothing
 * under the water leaks into the image.
 */
export class PlanarReflector {
  readonly target: WebGLRenderTarget
  /** World position → projective reflection texture coordinates. */
  readonly textureMatrix = new Matrix4()
  private readonly virtualCamera = new PerspectiveCamera()
  private readonly waterPlane = new Plane(new Vector3(0, 1, 0), 0)
  private readonly clearColor = new Color(HEX.horizon)
  private readonly savedClear = new Color()
  private readonly scratch = {
    position: new Vector3(),
    forward: new Vector3(),
    up: new Vector3(),
    target: new Vector3(),
    rotation: new Matrix4(),
    plane: new Plane(),
    clip: new Vector4(),
    q: new Vector4(),
  }

  constructor() {
    this.target = new WebGLRenderTarget(512, 256, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      samples: 4,
    })
  }

  /** Sizes the target to 3/4 of the drawing buffer, capped at 1024 wide. */
  setSize(bufferWidth: number, bufferHeight: number): void {
    const width = Math.max(256, Math.min(MAX_WIDTH, Math.round(bufferWidth * 0.75)))
    const height = Math.max(128, Math.round((width * bufferHeight) / Math.max(bufferWidth, 1)))
    this.target.setSize(width, height)
  }

  private mirrorCamera(camera: PerspectiveCamera): boolean {
    const { position, forward, up, target, rotation } = this.scratch
    position.setFromMatrixPosition(camera.matrixWorld)
    if (position.y <= 0.01) return false
    rotation.extractRotation(camera.matrixWorld)
    forward.set(0, 0, -1).applyMatrix4(rotation)
    up.set(0, 1, 0).applyMatrix4(rotation)

    const virtual = this.virtualCamera
    virtual.position.set(position.x, -position.y, position.z)
    target.copy(position).add(forward)
    target.y = -target.y
    virtual.up.set(up.x, -up.y, up.z)
    virtual.lookAt(target)
    virtual.near = camera.near
    virtual.far = camera.far
    virtual.updateMatrixWorld()
    virtual.projectionMatrix.copy(camera.projectionMatrix)
    return true
  }

  /** Lengyel's oblique frustum: the near plane becomes the water surface. */
  private clipToWater(): void {
    const { plane, clip, q } = this.scratch
    const virtual = this.virtualCamera
    plane.copy(this.waterPlane).applyMatrix4(virtual.matrixWorldInverse)
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
    const e = virtual.projectionMatrix.elements
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14])
    clip.multiplyScalar(2 / clip.dot(q))
    e[2] = clip.x
    e[6] = clip.y
    e[10] = clip.z + 1 - CLIP_BIAS
    e[14] = clip.w
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, water: Object3D): void {
    if (!this.mirrorCamera(camera)) return
    const virtual = this.virtualCamera
    this.textureMatrix.copy(BIAS).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse)
    this.clipToWater()

    const previous = renderer.getRenderTarget()
    renderer.getClearColor(this.savedClear)
    const alpha = renderer.getClearAlpha()
    water.visible = false
    renderer.setRenderTarget(this.target)
    renderer.setClearColor(this.clearColor, 1)
    renderer.clear()
    renderer.render(scene, virtual)
    water.visible = true
    renderer.setClearColor(this.savedClear, alpha)
    renderer.setRenderTarget(previous)
  }

  dispose(): void {
    this.target.dispose()
  }
}
