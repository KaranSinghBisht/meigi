import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { FRAME } from '../shared/sceneBus'
import { createSkyMaterial } from './skyMaterial'

interface SkyProps {
  readonly animate: boolean
}

/** Gradient dome that follows the camera so it always reads as infinitely far. */
export function Sky({ animate }: SkyProps) {
  const mesh = useRef<Mesh>(null)
  const material = useMemo(createSkyMaterial, [])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state, delta) => {
    const dome = mesh.current
    if (!dome) return
    dome.position.copy(state.camera.position)
    if (animate) material.uniforms.uTime.value += Math.min(delta, 0.1)
  }, FRAME.animate)

  return (
    <mesh ref={mesh} material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[2000, 48, 32]} />
    </mesh>
  )
}
