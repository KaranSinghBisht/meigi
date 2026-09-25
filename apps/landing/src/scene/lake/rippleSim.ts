import {
  BufferAttribute,
  BufferGeometry,
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three'
import type { WakeSegment, WaterDrop } from '../shared/sceneBus'
import { mappingUniform, type SimMapping } from './simMapping'
import { MAX_SIM_DROPS, simFragmentShader, simVertexShader } from './simShader'

const STEP_RATE = 120 // simulation steps per second, independent of frame rate
const MAX_STEPS_PER_FRAME = 4

export interface SimSources {
  readonly drops: readonly WaterDrop[]
  readonly wake: WakeSegment | null
}

function fullscreenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  return geometry
}

function createTarget(size: number): WebGLRenderTarget {
  return new WebGLRenderTarget(size, size, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
}

/** GPU ping-pong wave simulation for cursor and petal ripples. */
export class RippleSim {
  readonly size: number
  private readonly targets: [WebGLRenderTarget, WebGLRenderTarget]
  private readIndex = 0
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material: ShaderMaterial
  private readonly quad: Mesh
  private accumulator = 0
  private needsClear = true
  private readonly savedClear = new Color()

  constructor(size = 512) {
    this.size = size
    this.targets = [createTarget(size), createTarget(size)]
    this.material = new ShaderMaterial({
      uniforms: {
        uState: { value: null },
        uTexel: { value: new Vector2(1 / size, 1 / size) },
        uMap: { value: new Vector4(1, 0.2, 0.002, 0) },
        uOrigin: { value: new Vector2() },
        uCourant: { value: 0.42 },
        uDamping: { value: 0.988 },
        uDrops: { value: Array.from({ length: MAX_SIM_DROPS }, () => new Vector4()) },
        uDropCount: { value: 0 },
        uWake: { value: new Vector4() },
        uWakeShape: { value: new Vector2() },
      },
      vertexShader: simVertexShader,
      fragmentShader: simFragmentShader,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new Mesh(fullscreenTriangle(), this.material)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  get texture(): Texture {
    return this.targets[this.readIndex].texture
  }

  setMapping(mapping: SimMapping): void {
    mappingUniform(mapping, this.material.uniforms.uMap.value as Vector4)
    ;(this.material.uniforms.uOrigin.value as Vector2).set(mapping.originX, mapping.originZ)
    this.needsClear = true
  }

  /**
   * Advances the simulation by `delta` seconds of fixed-rate steps. Sources
   * are only pulled when a step is due, so none are dropped between steps.
   */
  step(renderer: WebGLRenderer, delta: number, takeSources: () => SimSources): void {
    if (this.needsClear) this.clear(renderer)
    this.accumulator = Math.min(this.accumulator + delta, MAX_STEPS_PER_FRAME / STEP_RATE)
    const steps = Math.floor(this.accumulator * STEP_RATE)
    if (steps === 0) return
    this.accumulator -= steps / STEP_RATE

    const { drops, wake } = takeSources()
    const previous = renderer.getRenderTarget()
    for (let i = 0; i < steps; i++) {
      this.setSources(i === 0 ? drops : [], i === 0 ? wake : null)
      this.material.uniforms.uState.value = this.targets[this.readIndex].texture
      renderer.setRenderTarget(this.targets[1 - this.readIndex])
      renderer.render(this.scene, this.camera)
      this.readIndex = 1 - this.readIndex
    }
    renderer.setRenderTarget(previous)
  }

  private setSources(drops: readonly WaterDrop[], wake: WakeSegment | null): void {
    const uniforms = this.material.uniforms
    const slots = uniforms.uDrops.value as Vector4[]
    const count = Math.min(drops.length, MAX_SIM_DROPS)
    for (let i = 0; i < count; i++) {
      const drop = drops[i]
      slots[i].set(drop.x, drop.z, drop.radius, drop.amplitude)
    }
    uniforms.uDropCount.value = count
    const shape = uniforms.uWakeShape.value as Vector2
    if (!wake) {
      shape.set(1, 0)
      return
    }
    ;(uniforms.uWake.value as Vector4).set(wake.x, wake.z, wake.toX, wake.toZ)
    shape.set(wake.radius, wake.amplitude)
  }

  private clear(renderer: WebGLRenderer): void {
    const previous = renderer.getRenderTarget()
    renderer.getClearColor(this.savedClear)
    const alpha = renderer.getClearAlpha()
    renderer.setClearColor(0x000000, 0)
    for (const target of this.targets) {
      renderer.setRenderTarget(target)
      renderer.clear(true, false, false)
    }
    renderer.setClearColor(this.savedClear, alpha)
    renderer.setRenderTarget(previous)
    this.needsClear = false
  }

  dispose(): void {
    for (const target of this.targets) target.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
