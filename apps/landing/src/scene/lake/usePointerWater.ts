import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import { sceneBus } from '../shared/sceneBus'
import { texelRadius, worldToSim, type SimMapping } from './simMapping'

const WAKE_TEXELS = 4.5
const WAKE_STRENGTH = 0.05
const TAP_TEXELS = 7
const TAP_STRENGTH = 0.16
/** Pointer travel over the water before the caption appears. */
const CAPTION_TRAVEL_PX = 80

type Projector = (event: PointerEvent) => Vector3 | null

interface LastPoint {
  readonly x: number
  readonly z: number
  readonly px: number
  readonly py: number
}

/** Raycasts the pointer onto the water plane y = 0; null when off the sim. */
function createProjector(canvas: HTMLCanvasElement, camera: Camera, mapping: SimMapping): Projector {
  const raycaster = new Raycaster()
  const ndc = new Vector2()
  const hit = new Vector3()
  const surface = new Plane(new Vector3(0, 1, 0), 0)
  return (event) => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(ndc, camera)
    const point = raycaster.ray.intersectPlane(surface, hit)
    if (!point || !worldToSim(mapping, point.x, point.z)) return null
    return point
  }
}

/** A trough along the pointer's path, deeper the faster it moves. */
function pushWake(from: LastPoint, to: Vector3, mapping: SimMapping, simSize: number): void {
  const radius = texelRadius(mapping, to.z, WAKE_TEXELS, simSize)
  const speed = Math.min(Math.hypot(to.x - from.x, to.z - from.z) / radius, 1.4)
  sceneBus.addWake(
    { x: from.x, z: from.z, toX: to.x, toZ: to.z, radius, amplitude: -WAKE_STRENGTH * radius * speed },
    WAKE_STRENGTH * radius * 2,
  )
}

function createHandlers(project: Projector, mapping: SimMapping, simSize: number) {
  let last: LastPoint | null = null
  let travelled = 0

  const onMove = (event: PointerEvent) => {
    const point = project(event)
    if (!point) {
      last = null
      return
    }
    if (last) {
      pushWake(last, point, mapping, simSize)
      travelled += Math.hypot(event.clientX - last.px, event.clientY - last.py)
      if (travelled > CAPTION_TRAVEL_PX) sceneBus.noteRipple()
    }
    last = { x: point.x, z: point.z, px: event.clientX, py: event.clientY }
  }

  const onDown = (event: PointerEvent) => {
    const point = project(event)
    if (!point) return
    const radius = texelRadius(mapping, point.z, TAP_TEXELS, simSize)
    sceneBus.pushDrop({ x: point.x, z: point.z, radius, amplitude: -TAP_STRENGTH * radius })
    sceneBus.noteRipple()
  }

  const forget = () => {
    last = null
  }

  return { onMove, onDown, forget }
}

/** Turns pointer movement over the lake into wakes and taps into drops. */
export function usePointerWater(mapping: SimMapping, simSize: number, enabled: boolean): void {
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.gl.domElement)

  useEffect(() => {
    if (!enabled) return
    const { onMove, onDown, forget } = createHandlers(createProjector(canvas, camera, mapping), mapping, simSize)
    const root = document.documentElement
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('blur', forget)
    root.addEventListener('pointerleave', forget)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('blur', forget)
      root.removeEventListener('pointerleave', forget)
    }
  }, [camera, canvas, mapping, simSize, enabled])
}
