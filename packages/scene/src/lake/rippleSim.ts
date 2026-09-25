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

function createSimUniforms(size: number) {
  return {
    uState: { value: null as Texture | null },
    uTexel: { value: new Vector2(1 / size, 1 / size) },
    uMap: { value: new Vector4(1, 0.2, 0.002, 0) },
    uOrigin: { value: new Vector2() },
    uCourant: { value: 0.42 },
    uDamping: { value: 0.988 },
    uDrops: { value: Array.from({ length: MAX_SIM_DROPS }, () => new Vector4()) },
    uDropCount: { value: 0 },
    uWake: { value: new Vector4() },
    uWakeShape: { value: new Vector2() },
  }
}

/** GPU ping-pong wave simulation for cursor and petal ripples. */
export class RippleSim {
  readonly size: number
  private read: WebGLRenderTarget
  private write: WebGLRenderTarget
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly uniforms: ReturnType<typeof createSimUniforms>
  private readonly material: ShaderMaterial
  private readonly quad: Mesh
  private accumulator = 0
  private needsClear = true
  private readonly savedClear = new Color()

  constructor(size = 512) {
    this.size = size
    this.read = createTarget(size)
    this.write = createTarget(size)
    this.uniforms = createSimUniforms(size)
    this.material = new ShaderMaterial({
      uniforms: this.uniforms,
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
    return this.read.texture
  }

  setMapping(mapping: SimMapping): void {
    mappingUniform(mapping, this.uniforms.uMap.value)
    this.uniforms.uOrigin.value.set(mapping.originX, mapping.originZ)
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
      this.uniforms.uState.value = this.read.texture
      renderer.setRenderTarget(this.write)
      renderer.render(this.scene, this.camera)
      const written = this.write
      this.write = this.read
      this.read = written
    }
    renderer.setRenderTarget(previous)
  }

  private setSources(drops: readonly WaterDrop[], wake: WakeSegment | null): void {
    const uniforms = this.uniforms
    const slots = uniforms.uDrops.value
    const used = drops.slice(0, MAX_SIM_DROPS)
    used.forEach((drop, i) => slots[i]?.set(drop.x, drop.z, drop.radius, drop.amplitude))
    uniforms.uDropCount.value = used.length
    if (!wake) {
      uniforms.uWakeShape.value.set(1, 0)
      return
    }
    uniforms.uWake.value.set(wake.x, wake.z, wake.toX, wake.toZ)
    uniforms.uWakeShape.value.set(wake.radius, wake.amplitude)
  }

  private clear(renderer: WebGLRenderer): void {
    const previous = renderer.getRenderTarget()
    renderer.getClearColor(this.savedClear)
    const alpha = renderer.getClearAlpha()
    renderer.setClearColor(0x000000, 0)
    for (const target of [this.read, this.write]) {
      renderer.setRenderTarget(target)
      renderer.clear(true, false, false)
    }
    renderer.setClearColor(this.savedClear, alpha)
    renderer.setRenderTarget(previous)
    this.needsClear = false
  }

  dispose(): void {
    this.read.dispose()
    this.write.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
