import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { InstancedBufferAttribute, type InstancedMesh } from 'three'
import { useStationPose } from '../camera/useStationPose'
import { FRAME, sceneBus } from '../shared/sceneBus'
import type { Station } from '../types'
import { PetalField } from './petalField'
import { createPetalGeometry } from './petalGeometry'
import { createPetalMaterial } from './petalMaterial'

const PETAL_COUNT = 250
const BURST_PETALS = 80

/** A landing petal leaves a small dimple; the sim caps drops per step. */
function dropRipple(x: number, z: number): void {
  const depth = Math.max(-z, 1)
  const radius = 0.006 * depth + 0.02
  sceneBus.pushDrop({ x, z, radius, amplitude: -0.05 * radius })
}

interface SakuraProps {
  readonly station: Station
  readonly animate: boolean
}

function usePetalResources(field: PetalField) {
  const geometry = useMemo(() => {
    const petal = createPetalGeometry()
    petal.setAttribute('aFade', new InstancedBufferAttribute(field.fade, 1))
    return petal
  }, [field])
  const material = useMemo(createPetalMaterial, [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  return { geometry, material }
}

/** One frame: apply the 'ok' mood (flurry + gust), then integrate and upload. */
function stepPetals(field: PetalField, petals: InstancedMesh, time: number, dt: number): void {
  const mood = sceneBus.mood
  if (mood.burst) {
    field.burst(BURST_PETALS)
    mood.burst = false
  }
  field.gust = mood.gust
  field.update(dt, time, dropRipple)
  field.write(petals, time)
}

export function Sakura({ station, animate }: SakuraProps) {
  const mesh = useRef<InstancedMesh>(null)
  const pose = useStationPose(station)
  const [field] = useState(() => new PetalField(PETAL_COUNT, 20260926, pose.position))
  const { geometry, material } = usePetalResources(field)
  // Own clock: R3F's elapsed time restarts whenever the frameloop resumes.
  const time = useRef(0)

  // Place the petals once so a reduced-motion render still shows them, and
  // re-seed them in front of the camera when it settles at another station.
  useLayoutEffect(() => {
    field.setAnchor(pose.position)
    if (mesh.current) field.write(mesh.current, time.current)
  }, [field, pose])

  useFrame((_, delta) => {
    const petals = mesh.current
    if (!animate || !petals) return
    const dt = Math.min(delta, 0.05)
    time.current += dt
    stepPetals(field, petals, time.current, dt)
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
