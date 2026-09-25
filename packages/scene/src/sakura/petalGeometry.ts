import { BufferAttribute, BufferGeometry } from 'three'

// Half outline of a cherry petal, base at (0, 0), notched tip near y = 1.
const HALF_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.14, 0.1],
  [0.3, 0.3],
  [0.4, 0.55],
  [0.41, 0.74],
  [0.34, 0.9],
  [0.2, 1],
  [0.07, 0.97],
  [0, 0.88],
]

/** Returns the full outline, counter-clockwise, without repeating endpoints. */
function outline(): Array<readonly [number, number]> {
  const right = HALF_OUTLINE
  const left = HALF_OUTLINE.slice(1, -1)
    .map(([x, y]) => [-x, y] as const)
    .reverse()
  return [...right, ...left]
}

/** A small cupped petal, about one unit long, centred on its middle. */
export function createPetalGeometry(): BufferGeometry {
  const ring = outline()
  const centre: readonly [number, number] = [0, 0.5]
  const points = [centre, ...ring]
  const positions = new Float32Array(points.length * 3)
  const uvs = new Float32Array(points.length * 2)
  points.forEach(([x, y], i) => {
    const cup = 0.12 * x * x * 4
    positions.set([x, y - 0.5, cup], i * 3)
    uvs.set([x + 0.5, y], i * 2)
  })

  const indices: number[] = []
  for (let i = 1; i <= ring.length; i++) {
    const next = i === ring.length ? 1 : i + 1
    indices.push(0, i, next)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
