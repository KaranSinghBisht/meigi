import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera, type Mesh, type ShaderMaterial, type Vector2, type Vector4 } from 'three'
import { FRAME, sceneBus } from '../shared/sceneBus'
import { WORLD, framingFor } from '../shared/world'
import { PlanarReflector } from './reflector'
import { RippleSim, type SimSources } from './rippleSim'
import { createSimMapping, mappingUniform, type SimMapping } from './simMapping'
import { usePointerWater } from './usePointerWater'
import { createWaterMaterial } from './waterMaterial'

const SIM_SIZE = 512
const DEG = Math.PI / 180

function takeSources(): SimSources {
  return { drops: sceneBus.takeDrops(), wake: sceneBus.takeWake() }
}

function useLakeResources() {
  const sim = useMemo(() => new RippleSim(SIM_SIZE), [])
  const reflector = useMemo(() => new PlanarReflector(), [])
  const material = useMemo(
    () =>
      createWaterMaterial({
        reflection: reflector.target.texture,
        textureMatrix: reflector.textureMatrix,
        simSize: SIM_SIZE,
      }),
    [reflector],
  )
  useEffect(
    () => () => {
      sim.dispose()
      reflector.dispose()
      material.dispose()
    },
    [sim, reflector, material],
  )
  return { sim, reflector, material }
}

/** Keeps the sim mapping, reflection target and focal scale in step with the viewport. */
function useLakeViewport(sim: RippleSim, reflector: PlanarReflector, material: ShaderMaterial): SimMapping {
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)
  const aspect = size.width / Math.max(size.height, 1)
  const mapping = useMemo(() => createSimMapping(framingFor(aspect), aspect), [aspect])

  useEffect(() => {
    sim.setMapping(mapping)
    mappingUniform(mapping, material.uniforms.uMap.value as Vector4)
    ;(material.uniforms.uOrigin.value as Vector2).set(mapping.originX, mapping.originZ)
  }, [mapping, sim, material])

  useEffect(() => {
    reflector.setSize(size.width * dpr, size.height * dpr)
    const tanHalf = Math.tan((framingFor(aspect).fov * DEG) / 2)
    ;(material.uniforms.uFocal.value as Vector2).set(1 / (2 * tanHalf * aspect), 1 / (2 * tanHalf))
  }, [size.width, size.height, dpr, aspect, reflector, material])

  return mapping
}

interface LakeProps {
  /** False under prefers-reduced-motion: no ripples, no swell, one still frame. */
  readonly animate: boolean
}

export function Lake({ animate }: LakeProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const mesh = useRef<Mesh>(null)
  const { sim, reflector, material } = useLakeResources()
  const mapping = useLakeViewport(sim, reflector, material)
  usePointerWater(mapping, SIM_SIZE, animate)

  useFrame((_, delta) => {
    if (animate) {
      sim.step(gl, Math.min(delta, 0.1), takeSources)
      material.uniforms.uTime.value += Math.min(delta, 0.1)
    }
    material.uniforms.uRipple.value = sim.texture
  }, FRAME.simulate)

  useFrame(() => {
    const water = mesh.current
    if (water && camera instanceof PerspectiveCamera) reflector.render(gl, scene, camera, water)
  }, FRAME.reflect)

  const { halfWidth, nearZ, farZ } = WORLD.lake
  return (
    <mesh ref={mesh} material={material} rotation-x={-Math.PI / 2} position={[0, 0, (nearZ + farZ) / 2]}>
      <planeGeometry args={[halfWidth * 2, nearZ - farZ]} />
    </mesh>
  )
}
