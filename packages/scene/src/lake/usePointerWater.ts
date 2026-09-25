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

/** How long an on-demand canvas keeps rendering after the water is touched. */
const RIPPLE_AWAKE_MS = 3500
/** Screen point (NDC) where sceneEvents.ripple lands: the middle of the lake. */
const CENTRE_NDC_Y = -0.5
const CENTRE_TEXELS = 8
const CENTRE_STRENGTH = 0.05

type Projector = (event: PointerEvent) => Vector3 | null

interface LastPoint {
  readonly x: number
  readonly z: number
  readonly px: number
  readonly py: number
}

const raycaster = new Raycaster()
const ndc = new Vector2()
const surface = new Plane(new Vector3(0, 1, 0), 0)

/** Raycasts a screen point onto the water plane y = 0; null when off the sim. */
function projectNdc(camera: Camera, mapping: SimMapping, x: number, y: number, hit: Vector3): Vector3 | null {
  raycaster.setFromCamera(ndc.set(x, y), camera)
  const point = raycaster.ray.intersectPlane(surface, hit)
  if (!point || !worldToSim(mapping, point.x, point.z)) return null
  return point
}

function createProjector(canvas: HTMLCanvasElement, camera: Camera, mapping: SimMapping): Projector {
  const hit = new Vector3()
  return (event) => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    return projectNdc(camera, mapping, x, y, hit)
  }
}

const centreHit = new Vector3()

/** Turns queued sceneEvents.ripple() calls into drops in the middle of the visible lake. */
export function dropCentreRipples(camera: Camera, mapping: SimMapping, simSize: number): void {
  const strengths = sceneBus.takeCenterRipples()
  if (strengths.length === 0) return
  const point = projectNdc(camera, mapping, 0, CENTRE_NDC_Y, centreHit)
  if (!point) return
  for (const strength of strengths) {
    const radius = texelRadius(mapping, point.z, CENTRE_TEXELS * Math.sqrt(strength), simSize)
    sceneBus.pushDrop({ x: point.x, z: point.z, radius, amplitude: -CENTRE_STRENGTH * strength * radius })
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
    sceneBus.keepAwake(RIPPLE_AWAKE_MS)
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
    sceneBus.keepAwake(RIPPLE_AWAKE_MS)
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
