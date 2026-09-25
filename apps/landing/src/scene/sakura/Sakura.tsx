import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedBufferAttribute, type InstancedMesh } from 'three'
import { FRAME, sceneBus } from '../shared/sceneBus'
import { PetalField } from './petalField'
import { createPetalGeometry } from './petalGeometry'
import { createPetalMaterial } from './petalMaterial'

const PETAL_COUNT = 250

/** A landing petal leaves a small dimple; the sim caps drops per step. */
function dropRipple(x: number, z: number): void {
  const depth = Math.max(-z, 1)
  const radius = 0.006 * depth + 0.02
  sceneBus.pushDrop({ x, z, radius, amplitude: -0.05 * radius })
}

interface SakuraProps {
  readonly animate: boolean
}

export function Sakura({ animate }: SakuraProps) {
  const mesh = useRef<InstancedMesh>(null)
  const field = useMemo(() => new PetalField(PETAL_COUNT, 20260926), [])
  const geometry = useMemo(() => {
    const petal = createPetalGeometry()
    petal.setAttribute('aFade', new InstancedBufferAttribute(field.fade, 1))
    return petal
  }, [field])
  const material = useMemo(createPetalMaterial, [])
  // Own clock: R3F's elapsed time restarts whenever the frameloop resumes.
  const time = useRef(0)

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  // Place the petals once so a reduced-motion render still shows them.
  useLayoutEffect(() => {
    if (mesh.current) field.write(mesh.current, 0)
  }, [field])

  useFrame((_, delta) => {
    const petals = mesh.current
    if (!animate || !petals) return
    const dt = Math.min(delta, 0.05)
    time.current += dt
    field.update(dt, time.current, dropRipple)
    field.write(petals, time.current)
  }, FRAME.animate)

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, PETAL_COUNT]}
      frustumCulled={false}
      renderOrder={3}
    />
  )
}
