import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Euler, PerspectiveCamera, Vector3, type CatmullRomCurve3 } from 'three'
import { FRAME, sceneBus } from '../shared/sceneBus'
import { WORLD, framingFor, toriiPlacement, type Framing, type ToriiPlacement } from '../shared/world'
import { createGlidePath, glideLookTarget } from './glidePath'

const DEG = Math.PI / 180
const PARALLAX_YAW = 1.5 * DEG
const PARALLAX_PITCH = 0.7 * DEG
const PARALLAX_SHIFT = 0.35
const FOLLOW_RATE = 2.4

const restEuler = new Euler(0, 0, 0, 'YXZ')
const lookTarget = new Vector3()

interface RigState {
  yaw: number
  pitch: number
  /** Own clock: R3F's elapsed time restarts whenever the frameloop resumes. */
  time: number
  path: CatmullRomCurve3 | null
  /** Point the camera was looking at when the glide began. */
  restLook: Vector3
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

function placeAtRest(camera: PerspectiveCamera, framing: Framing, rig: RigState): void {
  const driftX = Math.sin(rig.time * 0.07) * 0.22 + rig.yaw * (PARALLAX_SHIFT / PARALLAX_YAW)
  const driftY = Math.sin(rig.time * 0.11 + 1.2) * 0.04
  camera.position.set(driftX, WORLD.eyeHeight + driftY, 0)
  const sway = Math.sin(rig.time * 0.05 + 0.4) * 0.12 * DEG
  camera.quaternion.setFromEuler(restEuler.set(framing.pitch + rig.pitch, -rig.yaw + sway, 0))
  camera.updateMatrixWorld()
}

function placeOnGlide(camera: PerspectiveCamera, framing: Framing, torii: ToriiPlacement, rig: RigState): void {
  if (!rig.path) {
    rig.path = createGlidePath(camera.position, torii)
    camera.getWorldDirection(rig.restLook).multiplyScalar(40).add(camera.position)
  }
  const t = Math.min(Math.max(sceneBus.glideProgress, 0), 1)
  rig.path.getPointAt(t, camera.position)
  glideLookTarget(rig.path, t, lookTarget)
  camera.lookAt(lookTarget.lerpVectors(rig.restLook, lookTarget, smoothstep(0, 0.22, t)))
  camera.fov = framing.fov + 7 * Math.sin(t * Math.PI * 0.5)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

/** Resets lens and pose to the resting framing, e.g. after a bfcache restore mid-glide. */
function settleAtRest(camera: PerspectiveCamera, framing: Framing, rig: RigState): void {
  rig.path = null
  camera.fov = framing.fov
  camera.updateProjectionMatrix()
  placeAtRest(camera, framing, rig)
}

/** Mouse position in NDC for the ±1.5° parallax; touch never steers the camera. */
function usePointerParallax(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      sceneBus.pointer.x = (event.clientX / window.innerWidth) * 2 - 1
      sceneBus.pointer.y = (event.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled])
}

interface CameraRigProps {
  readonly animate: boolean
}

export function CameraRig({ animate }: CameraRigProps) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const aspect = size.width / Math.max(size.height, 1)
  const framing = useMemo(() => framingFor(aspect), [aspect])
  const torii = useMemo(() => toriiPlacement(aspect), [aspect])
  const rig = useRef<RigState>({ yaw: 0, pitch: 0, time: 0, path: null, restLook: new Vector3() })
  usePointerParallax(animate)

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.near = 0.1
    camera.far = WORLD.cameraFar
    settleAtRest(camera, framing, rig.current)
    invalidate()
  }, [camera, framing, invalidate])

  useFrame((_, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const current = rig.current
    if (sceneBus.glideActive) return placeOnGlide(camera, framing, torii, current)
    if (current.path) settleAtRest(camera, framing, current)
    if (!animate) return
    const dt = Math.min(delta, 0.1)
    const k = 1 - Math.exp(-FOLLOW_RATE * dt)
    current.time += dt
    current.yaw += (sceneBus.pointer.x * PARALLAX_YAW - current.yaw) * k
    current.pitch += (-sceneBus.pointer.y * PARALLAX_PITCH - current.pitch) * k
    placeAtRest(camera, framing, current)
  }, FRAME.camera)

  return null
}
