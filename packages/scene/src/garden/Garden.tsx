import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { InstancedMesh, ShaderMaterial } from 'three'
import { useAspect } from '../camera/useStationPose'
import { frameClock } from '../shared/frameClock'
import { FRAME } from '../shared/sceneBus'
import { createCosmosGeometry, createCosmosMaterial } from './cosmos'
import { createFoliageGeometry, createFoliageMaterial } from './foliage'
import { gardenLayout } from './gardenLayout'
import { createGroundGeometry, createGroundMaterial } from './ground'
import { createKochiaGeometry, createKochiaMaterial, kochiaMatrices } from './kochia'
import { createLavenderGeometry, createLavenderMaterial } from './lavender'
import { createCosmosTexture, createFoliageTexture } from './paintedTextures'

/**
 * Layer for garden parts the lake's reflection skips: only the kochia domes,
 * which stand at the water's edge, are big enough to show in it.
 */
const NO_REFLECTION = 1

function usePaintedTextures() {
  const textures = useMemo(() => ({ petals: createCosmosTexture(), clump: createFoliageTexture() }), [])
  useEffect(
    () => () => {
      textures.petals.dispose()
      textures.clump.dispose()
    },
    [textures],
  )
  return textures
}

function useGardenResources(aspect: number) {
  const { petals, clump } = usePaintedTextures()
  const layout = useMemo(() => gardenLayout(aspect), [aspect])
  const parts = useMemo(
    () => ({
      ground: { geometry: createGroundGeometry(layout.shore), material: createGroundMaterial(layout.shore) },
      kochia: { geometry: createKochiaGeometry(layout.kochiaTint), material: createKochiaMaterial() },
      foliage: { geometry: createFoliageGeometry(layout.foliage, layout.foliageShade), material: createFoliageMaterial(clump) },
      lavender: { geometry: createLavenderGeometry(layout.lavender), material: createLavenderMaterial() },
      cosmos: { geometry: createCosmosGeometry(layout.cosmos, layout.cosmosLook), material: createCosmosMaterial(petals) },
    }),
    [layout, petals, clump],
  )
  useEffect(
    () => () => {
      for (const part of Object.values(parts)) {
        part.geometry.dispose()
        part.material.dispose()
      }
    },
    [parts],
  )
  return { layout, ...parts }
}

interface GardenProps {
  readonly animate: boolean
}

/**
 * The Oishi Park beds on the near shore (hero and shore stations): five
 * instanced draw calls, plus the kochia again in the lake's reflection.
 */
export function Garden({ animate }: GardenProps) {
  const aspect = useAspect()
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const { layout, ground, kochia, foliage, lavender, cosmos } = useGardenResources(aspect)
  const domes = useRef<InstancedMesh>(null)
  const time = useRef(0)

  useLayoutEffect(() => {
    const mesh = domes.current
    if (!mesh) return
    kochiaMatrices(layout.kochia).forEach((matrix, i) => mesh.setMatrixAt(i, matrix))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [layout])

  // The main view sees every garden layer; compile now so the first glide never waits on a shader.
  useEffect(() => {
    camera.layers.enable(NO_REFLECTION)
    gl.compile(scene, camera)
  }, [camera, gl, scene, ground, kochia, foliage, lavender, cosmos])

  const swaying: readonly ShaderMaterial[] = [cosmos.material, lavender.material, foliage.material]
  useFrame(() => {
    if (!animate) return
    time.current += frameClock.dt
    for (const material of swaying) {
      const uniform = material.uniforms.uTime
      if (uniform) uniform.value = time.current
    }
  }, FRAME.animate)

  return (
    <group>
      <mesh geometry={ground.geometry} material={ground.material} layers={NO_REFLECTION} renderOrder={-1} />
      <instancedMesh ref={domes} args={[kochia.geometry, kochia.material, layout.kochiaTint.length]} />
      <mesh geometry={foliage.geometry} material={foliage.material} layers={NO_REFLECTION} frustumCulled={false} />
      <mesh geometry={lavender.geometry} material={lavender.material} layers={NO_REFLECTION} frustumCulled={false} />
      <mesh geometry={cosmos.geometry} material={cosmos.material} layers={NO_REFLECTION} frustumCulled={false} />
    </group>
  )
}
