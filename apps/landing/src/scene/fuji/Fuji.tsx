import { useEffect, useMemo } from 'react'
import { WORLD } from '../shared/world'
import { createFujiGeometry } from './fujiGeometry'
import { createFujiMaterial } from './fujiMaterial'

/** The mountain. Static by design: only its reflection is allowed to move. */
export function Fuji() {
  const geometry = useMemo(() => createFujiGeometry(WORLD.fuji), [])
  const material = useMemo(() => createFujiMaterial(WORLD.fuji), [])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return <mesh geometry={geometry} material={material} matrixAutoUpdate={false} />
}
