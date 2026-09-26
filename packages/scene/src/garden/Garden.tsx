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
import { paintCosmosHeads } from './cosmosHeads'
import { createFoliageTexture } from './paintedTextures'

/**
 * Layer for garden parts the lake's reflection skips: only the kochia domes,
 * which stand at the water's edge, are big enough to show in it.
 */
const NO_REFLECTION = 1

function usePaintedTextures() {
  const textures = useMemo(() => ({ ...paintCosmosHeads(), clump: createFoliageTexture() }), [])
  useEffect(
    () => () => {
      textures.sharp.dispose()
      textures.bokeh.dispose()
      textures.clump.dispose()
    },
    [textures],
  )
  return textures
}

/** Phones and dense-pixel screens get a lighter garden: fewer heads and clumps, simpler domes. */
function useCompact(): boolean {
  const width = useThree((state) => state.size.width)
  const dpr = useThree((state) => state.viewport.dpr)
  const aspect = useAspect()
  return aspect < 0.8 || width < 820 || dpr > 2.2
}

function useGardenResources(aspect: number, compact: boolean) {
  const { sharp, bokeh, clump } = usePaintedTextures()
  const layout = useMemo(() => gardenLayout(aspect, compact), [aspect, compact])
  const parts = useMemo(
    () => ({
      ground: { geometry: createGroundGeometry(layout.shore), material: createGroundMaterial(layout.shore) },
      kochia: { geometry: createKochiaGeometry(layout.kochiaTint, compact), material: createKochiaMaterial() },
      foliage: { geometry: createFoliageGeometry(layout.foliage, layout.foliageShade), material: createFoliageMaterial(clump, compact ? 0.4 : 1) },
      lavender: { geometry: createLavenderGeometry(layout.lavender), material: createLavenderMaterial() },
      cosmos: { geometry: createCosmosGeometry(layout.cosmos, layout.cosmosLook, !compact), material: createCosmosMaterial(sharp, false) },
      bokeh: { geometry: createCosmosGeometry(layout.bokeh, layout.bokehLook, false), material: createCosmosMaterial(bokeh, true) },
    }),
    [layout, compact, sharp, bokeh, clump],
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
 * The Oishi Park beds on the near shore (hero and shore stations): six
 * instanced draw calls (the last the out-of-focus front row), plus the kochia
 * again in the lake's reflection.
 */
export function Garden({ animate }: GardenProps) {
  const aspect = useAspect()
  const compact = useCompact()
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const { layout, ground, kochia, foliage, lavender, cosmos, bokeh } = useGardenResources(aspect, compact)
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
  }, [camera, gl, scene, ground, kochia, foliage, lavender, cosmos, bokeh])

  const swaying: readonly ShaderMaterial[] = [cosmos.material, bokeh.material, lavender.material, foliage.material]
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
      <mesh geometry={bokeh.geometry} material={bokeh.material} layers={NO_REFLECTION} frustumCulled={false} renderOrder={4} />
    </group>
  )
}
