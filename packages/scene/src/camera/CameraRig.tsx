import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { FRAME, sceneBus } from '../shared/sceneBus'
import { WORLD, toriiPlacement } from '../shared/world'
import type { Station } from '../types'
import { copyPose, createBasePose, poseAt, startMove, stepMove, type BasePose, type CameraMove } from './cameraMoves'
import { stationPose, type StationPose } from './stations'
import { useAspect, useStationPose } from './useStationPose'

const DEG = Math.PI / 180
const PARALLAX_YAW = 1.5 * DEG
const PARALLAX_PITCH = 0.7 * DEG
const PARALLAX_SHIFT = 0.35
const FOLLOW_RATE = 2.4
const Y_AXIS = new Vector3(0, 1, 0)
const X_AXIS = new Vector3(1, 0, 0)
const yawTurn = new Quaternion()
const pitchTurn = new Quaternion()

interface RigState {
  yaw: number
  pitch: number
  /** Own clock: R3F's elapsed time restarts whenever the frameloop resumes. */
  time: number
  station: Station | null
  readonly base: BasePose
  move: CameraMove | null
  /** Debug replay of the hero → gate glide (?stats → __meigiDebug.glideTo). */
  pinned: CameraMove | null
}

/** Idle drift and ±1.5° parallax layered on the base pose (identical to the landing's rest pose at time 0). */
function applyPose(camera: PerspectiveCamera, rig: RigState): void {
  const { base } = rig
  const driftX = Math.sin(rig.time * 0.07) * 0.22 + rig.yaw * (PARALLAX_SHIFT / PARALLAX_YAW)
  const driftY = Math.sin(rig.time * 0.11 + 1.2) * 0.04
  camera.position.set(base.position.x + driftX, base.position.y + driftY, base.position.z)
  const sway = Math.sin(rig.time * 0.05 + 0.4) * 0.12 * DEG
  yawTurn.setFromAxisAngle(Y_AXIS, -rig.yaw + sway)
  pitchTurn.setFromAxisAngle(X_AXIS, rig.pitch)
  camera.quaternion.copy(yawTurn).multiply(base.quaternion).multiply(pitchTurn)
  if (camera.fov !== base.fov) {
    camera.fov = base.fov
    camera.updateProjectionMatrix()
  }
  camera.updateMatrixWorld()
}

function followPointer(rig: RigState, dt: number, interactive: boolean): void {
  const k = 1 - Math.exp(-FOLLOW_RATE * dt)
  rig.time += dt
  rig.yaw += ((interactive ? sceneBus.pointer.x * PARALLAX_YAW : 0) - rig.yaw) * k
  rig.pitch += ((interactive ? -sceneBus.pointer.y * PARALLAX_PITCH : 0) - rig.pitch) * k
}

interface GlidePoses {
  readonly hero: StationPose
  readonly gate: StationPose
  readonly aspect: number
}

/** Advances the base pose: a pinned debug glide, a station move, or rest at `target`. */
function advanceBase(rig: RigState, dt: number, glide: GlidePoses, target: StationPose): void {
  const pin = sceneBus.pinnedGlide
  if (pin !== null) {
    rig.pinned ??= startMove('hero', 'gate', glide.hero, glide.gate, toriiPlacement(glide.aspect))
    poseAt(rig.pinned, pin, rig.base)
    return
  }
  if (rig.pinned) {
    rig.pinned = null
    copyPose(target, rig.base)
  }
  if (rig.move && !stepMove(rig.move, dt, rig.base)) rig.move = null
  if (rig.move) sceneBus.keepAwake(250)
}

/** Mouse position in NDC for the parallax; touch never steers the camera. */
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
  readonly station: Station
  readonly animate: boolean
  readonly interactive: boolean
}

export function CameraRig({ station, animate, interactive }: CameraRigProps) {
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const aspect = useAspect()
  const target = useStationPose(station)
  const glide = useMemo(() => ({ hero: stationPose('hero', aspect), gate: stationPose('gate', aspect), aspect }), [aspect])
  const rig = useRef<RigState>({ yaw: 0, pitch: 0, time: 0, station: null, base: createBasePose(), move: null, pinned: null })
  usePointerParallax(animate && interactive)

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.near = 0.1
    camera.far = WORLD.cameraFar
  }, [camera])

  // A new station starts a move from wherever the camera is; a resize (same
  // station, new pose) or reduced motion jumps straight there.
  useEffect(() => {
    const state = rig.current
    const from = state.station
    if (animate && from !== null && from !== station) {
      state.move = startMove(from, station, state.base, target, toriiPlacement(aspect))
      sceneBus.keepAwake(state.move.duration * 1000 + 400)
    } else {
      copyPose(target, state.base)
      state.move = null
    }
    state.station = station
    invalidate()
  }, [station, target, aspect, animate, invalidate])

  useFrame((_, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const state = rig.current
    const dt = Math.min(delta, 0.1)
    advanceBase(state, dt, glide, target)
    if (animate) followPointer(state, dt, interactive)
    applyPose(camera, state)
  }, FRAME.camera)

  return null
}
