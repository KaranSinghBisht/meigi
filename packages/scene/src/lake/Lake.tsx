import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera, type Mesh } from 'three'
import { useStationPose } from '../camera/useStationPose'
import { FRAME, sceneBus } from '../shared/sceneBus'
import { WORLD } from '../shared/world'
import type { Station } from '../types'
import { PlanarReflector } from './reflector'
import { RippleSim, type SimSources } from './rippleSim'
import { createSimMapping, mappingUniform, mappingView, type SimMapping } from './simMapping'
import { dropCentreRipples, usePointerWater } from './usePointerWater'
import { createWaterMaterial, createWaterUniforms, type WaterUniforms } from './waterMaterial'
import { frameClock } from '../shared/frameClock'

const SIM_SIZE = 512
const DEG = Math.PI / 180

function takeSources(): SimSources {
  return { drops: sceneBus.takeDrops(), wake: sceneBus.takeWake() }
}

function useLakeResources() {
  const sim = useMemo(() => new RippleSim(SIM_SIZE), [])
  const reflector = useMemo(() => new PlanarReflector(), [])
  const uniforms = useMemo(
    () =>
      createWaterUniforms({
        reflection: reflector.target.texture,
        textureMatrix: reflector.textureMatrix,
        simSize: SIM_SIZE,
      }),
    [reflector],
  )
  const material = useMemo(() => createWaterMaterial(uniforms), [uniforms])
  useEffect(
    () => () => {
      sim.dispose()
      reflector.dispose()
      material.dispose()
    },
    [sim, reflector, material],
  )
  return { sim, reflector, uniforms, material }
}

/**
 * Keeps the sim mapping, reflection target and focal scale in step with the
 * viewport and with the station the camera rests at (or is heading to).
 */
function useLakeViewport(sim: RippleSim, reflector: PlanarReflector, uniforms: WaterUniforms, station: Station): SimMapping {
  const size = useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)
  const pose = useStationPose(station)
  const aspect = size.width / Math.max(size.height, 1)
  const mapping = useMemo(
    () => createSimMapping(mappingView(pose.position, pose.quaternion, pose.fov), aspect),
    [pose, aspect],
  )

  useEffect(() => {
    sim.setMapping(mapping)
    mappingUniform(mapping, uniforms.uMap.value)
    uniforms.uOrigin.value.set(mapping.originX, mapping.originZ)
  }, [mapping, sim, uniforms])

  useEffect(() => {
    reflector.setSize(size.width * dpr, size.height * dpr)
    const tanHalf = Math.tan((pose.fov * DEG) / 2)
    uniforms.uFocal.value.set(1 / (2 * tanHalf * aspect), 1 / (2 * tanHalf))
  }, [size.width, size.height, dpr, aspect, pose, reflector, uniforms])

  return mapping
}

interface LakeProps {
  readonly station: Station
  /** False under prefers-reduced-motion: no ripples, no swell, one still frame. */
  readonly animate: boolean
  /** The pointer ripples the water. */
  readonly interactive: boolean
}

export function Lake({ station, animate, interactive }: LakeProps) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const mesh = useRef<Mesh>(null)
  const { sim, reflector, uniforms, material } = useLakeResources()
  const mapping = useLakeViewport(sim, reflector, uniforms, station)
  usePointerWater(mapping, SIM_SIZE, animate && interactive)

  useFrame(() => {
    if (animate) {
      dropCentreRipples(camera, mapping, SIM_SIZE)
      sim.step(gl, frameClock.dt, takeSources)
      uniforms.uTime.value += frameClock.dt
    } else {
      sceneBus.takeCenterRipples()
    }
    uniforms.uRipple.value = sim.texture
    uniforms.uTint.value = sceneBus.mood.tint
    // A frozen payee stills the lake.
    uniforms.uWindGain.value = 1 - 0.75 * sceneBus.mood.mist
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
